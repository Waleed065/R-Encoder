/**
 * Enterprise-grade Image Encoder for receipt printers
 *
 * Provides memory-efficient image processing with RLE compression,
 * chunked transmission, and streaming support for large images.
 *
 * @module ImageEncoder
 */

/**
 * @typedef {Object} ImageData
 * @property {Uint8ClampedArray|number[]} data - RGBA pixel data
 * @property {number} width - Image width in pixels
 * @property {number} height - Image height in pixels
 */

/**
 * @typedef {Object} ChunkInfo
 * @property {Uint8Array} chunk - The data chunk
 * @property {number} index - Zero-based chunk index
 * @property {number} total - Total number of chunks
 * @property {boolean} isLast - Whether this is the final chunk
 * @property {number} byteOffset - Byte offset from start
 * @property {number} totalBytes - Total bytes in payload
 */

/**
 * @typedef {Object} RLEResult
 * @property {Uint8Array} data - Compressed or original data
 * @property {boolean} compressed - Whether compression was applied
 * @property {number} originalSize - Original data size
 * @property {number} compressedSize - Resulting data size
 * @property {number} ratio - Compression ratio (< 1.0 means compression helped)
 */

/**
 * @typedef {Object} RasterResult
 * @property {Uint8Array} data - Raster bitmap data
 * @property {number} widthBytes - Width in bytes (width / 8)
 * @property {number} height - Height in pixels
 */

/**
 * Memory pool for Uint8Array reuse to reduce GC pressure
 * @private
 */
class MemoryPool {
    /** @type {Map<number, Uint8Array[]>} */
    #pools = new Map();

    /** @type {number} */
    #maxPoolSize = 10;

    /** @type {number} */
    #maxBufferSize = 4 * 1024 * 1024; // 4MB max pooled buffer (increased for large receipts)

    /**
     * Acquire a buffer of at least the specified size
     * @param {number} size - Minimum buffer size needed
     * @return {Uint8Array} - Buffer from pool or newly allocated
     */
    acquire(size) {
        if (size > this.#maxBufferSize) {
            // Don't pool very large buffers
            return new Uint8Array(size);
        }

        // Round up to nearest power of 2 for better reuse
        const poolSize = this.#nextPowerOf2(size);
        const pool = this.#pools.get(poolSize);

        if (pool && pool.length > 0) {
            return pool.pop();
        }

        return new Uint8Array(poolSize);
    }

    /**
     * Release a buffer back to the pool
     * @param {Uint8Array} buffer - Buffer to release
     */
    release(buffer) {
        if (buffer.length > this.#maxBufferSize) {
            return; // Don't pool very large buffers
        }

        const poolSize = buffer.length;
        let pool = this.#pools.get(poolSize);

        if (!pool) {
            pool = [];
            this.#pools.set(poolSize, pool);
        }

        if (pool.length < this.#maxPoolSize) {
            // Zero out the buffer before returning to pool
            buffer.fill(0);
            pool.push(buffer);
        }
    }

    /**
     * Clear all pooled buffers
     */
    clear() {
        this.#pools.clear();
    }

    /**
     * Get next power of 2 >= n
     * @private
     * @param {number} n
     * @return {number}
     */
    #nextPowerOf2(n) {
        if (n <= 0) return 1;
        n--;
        n |= n >> 1;
        n |= n >> 2;
        n |= n >> 4;
        n |= n >> 8;
        n |= n >> 16;
        return n + 1;
    }
}

/**
 * ImageEncoder - Enterprise-grade image processing for receipt printers
 *
 * Features:
 * - Memory pooling for reduced GC pressure
 * - RLE compression for ESC/POS GS v 0 command
 * - Chunked payload generation for streaming
 * - Typed array operations (no spread operators)
 * - Comprehensive input validation
 */
class ImageEncoder {
    /** @type {MemoryPool} */
    static #memoryPool = new MemoryPool();

    /**
     * Default chunk size for transmission (512 bytes)
     * Optimized for typical printer buffer sizes
     * @type {number}
     */
    static DEFAULT_CHUNK_SIZE = 512;

    /**
     * Maximum RLE run length per ESC/POS spec
     * @type {number}
     */
    static MAX_RLE_RUN = 255;

    /**
     * Validate image input data
     * @param {ImageData} image - Image data to validate
     * @throws {Error} If validation fails
     */
    static validateImage(image) {
        if (!image || typeof image !== 'object') {
            throw new Error('ImageEncoder: image must be an object');
        }

        if (!image.data) {
            throw new Error('ImageEncoder: image.data is required');
        }

        if (typeof image.width !== 'number' || image.width <= 0) {
            throw new Error('ImageEncoder: image.width must be a positive number');
        }

        if (typeof image.height !== 'number' || image.height <= 0) {
            throw new Error('ImageEncoder: image.height must be a positive number');
        }

        const expectedLength = image.width * image.height * 4;
        if (image.data.length < expectedLength) {
            throw new Error(
                `ImageEncoder: image.data length (${image.data.length}) is less than expected (${expectedLength})`,
            );
        }
    }

    /**
     * Validate dimensions for printing
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @throws {Error} If validation fails
     */
    static validateDimensions(width, height) {
        if (typeof width !== 'number' || width <= 0) {
            throw new Error('ImageEncoder: width must be a positive number');
        }

        if (typeof height !== 'number' || height <= 0) {
            throw new Error('ImageEncoder: height must be a positive number');
        }

        if (width % 8 !== 0) {
            throw new Error('ImageEncoder: width must be a multiple of 8');
        }
    }

    /**
     * Get pixel value at coordinates (0 = white/transparent, 1 = black)
     * @param {ImageData} image - Source image
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Image width for bounds checking
     * @param {number} height - Image height for bounds checking
     * @return {number} 0 or 1
     */
    static getPixel(image, x, y, width, height) {
        if (x < 0 || x >= width || y < 0 || y >= height) {
            return 0;
        }
        const index = ((width * y) + x) * 4;
        // Pixel is black (print dot) if red channel <= 127
        // Using red channel as grayscale indicator
        return image.data[index] > 127 ? 0 : 1;
    }

    /**
     * Convert image to raster bitmap format (row-major, MSB first)
     * Used for ESC/POS GS v 0 command
     *
     * @param {ImageData} image - Source image data
     * @param {number} width - Target width (must be multiple of 8)
     * @param {number} height - Target height
     * @return {RasterResult} Raster bitmap data
     */
    static pixelsToRaster(image, width, height) {
        this.validateImage(image);
        this.validateDimensions(width, height);

        const widthBytes = width >> 3; // width / 8
        const totalBytes = widthBytes * height;
        const bytes = this.#memoryPool.acquire(totalBytes);

        // Ensure we have exactly the size we need (pool may give larger)
        const result = bytes.length === totalBytes ? bytes : bytes.subarray(0, totalBytes);
        result.fill(0);

        for (let y = 0; y < height; y++) {
            const rowOffset = y * widthBytes;
            for (let x = 0; x < width; x += 8) {
                let byte = 0;
                for (let b = 0; b < 8; b++) {
                    byte |= this.getPixel(image, x + b, y, width, height) << (7 - b);
                }
                result[rowOffset + (x >> 3)] = byte;
            }
        }

        return {
            data: result,
            widthBytes,
            height,
        };
    }

    /**
     * Default strip height for strip-based raster encoding
     * 512 rows = ~36KB per strip for 576px width
     * Larger strips = fewer GS v 0 commands = faster printing
     * Still safe for most printer memory buffers (typically 64KB+)
     * @type {number}
     */
    static IMAGE_STRIP_HEIGHT = 512;

    /**
     * Convert image to raster bitmap format in horizontal strips
     * Used for large images to avoid memory issues with single large buffer.
     * Each strip generates a separate GS v 0 command - printers handle this as continuous print.
     *
     * @param {ImageData} image - Source image data
     * @param {number} width - Target width (must be multiple of 8)
     * @param {number} height - Target height
     * @param {number} [stripHeight=256] - Height of each strip in rows
     * @return {{strips: RasterResult[], widthBytes: number, totalHeight: number}}
     */
    static pixelsToRasterStrips(image, width, height, stripHeight = this.IMAGE_STRIP_HEIGHT) {
        this.validateImage(image);
        this.validateDimensions(width, height);

        const widthBytes = width >> 3; // width / 8
        const strips = [];
        const totalStrips = Math.ceil(height / stripHeight);

        for (let s = 0; s < totalStrips; s++) {
            const startY = s * stripHeight;
            const currentStripHeight = Math.min(stripHeight, height - startY);
            const stripBytes = widthBytes * currentStripHeight;

            const bytes = this.#memoryPool.acquire(stripBytes);
            const stripData = bytes.length === stripBytes ? bytes : bytes.subarray(0, stripBytes);
            stripData.fill(0);

            for (let y = 0; y < currentStripHeight; y++) {
                const srcY = startY + y;
                const rowOffset = y * widthBytes;

                for (let x = 0; x < width; x += 8) {
                    let byte = 0;
                    for (let b = 0; b < 8; b++) {
                        byte |= this.getPixel(image, x + b, srcY, width, height) << (7 - b);
                    }
                    stripData[rowOffset + (x >> 3)] = byte;
                }
            }

            strips.push({
                data: stripData,
                widthBytes,
                height: currentStripHeight,
            });
        }

        return {
            strips,
            widthBytes,
            totalHeight: height,
        };
    }

    /**
     * Build multiple ESC/POS raster commands from strips
     * Returns array of Uint8Array commands, one per strip
     *
     * @param {RasterResult[]} strips - Array of raster strip results
     * @param {boolean} [useCompression=false] - Use RLE compression
     * @return {Uint8Array[]} Array of complete GS v 0 commands
     */
    static buildRasterCommandsFromStrips(strips, useCompression = false) {
        const commands = [];

        for (const strip of strips) {
            const command = this.buildRasterCommand(
                strip.data,
                strip.widthBytes,
                strip.height,
                useCompression,
            );
            commands.push(command.command);
        }

        return commands;
    }

    /**
     * Convert image to column format (24-dot vertical strips)
     * Used for ESC/POS ESC * command
     *
     * @param {ImageData} image - Source image data
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @return {Uint8Array[]} Array of column strip data
     */
    static pixelsToColumns(image, width, height) {
        this.validateImage(image);

        const strips = [];
        const totalStrips = Math.ceil(height / 24);

        for (let s = 0; s < totalStrips; s++) {
            const stripY = s * 24;
            const bytesPerStrip = width * 3;
            const bytes = this.#memoryPool.acquire(bytesPerStrip);
            const strip = bytes.length === bytesPerStrip ? bytes : bytes.subarray(0, bytesPerStrip);
            strip.fill(0);

            for (let x = 0; x < width; x++) {
                const offset = x * 3;

                // Pack 3 bytes per column (24 pixels vertical)
                for (let c = 0; c < 3; c++) {
                    let byte = 0;
                    for (let b = 0; b < 8; b++) {
                        byte |= this.getPixel(image, x, stripY + (c * 8) + b, width, height) << (7 - b);
                    }
                    strip[offset + c] = byte;
                }
            }

            strips.push(strip);
        }

        return strips;
    }

    /**
     * Compress data using RLE (Run-Length Encoding)
     * Compatible with ESC/POS GS v 0 mode 1
     *
     * RLE format: For runs of identical bytes:
     * - If run length <= 1: output byte as-is
     * - If run length > 1: output [count, byte]
     *
     * Note: ESC/POS RLE is a simple scheme where:
     * - Byte values 0x00-0x7F: literal (n+1 bytes follow)
     * - Byte values 0x80-0xFF: run of (n-0x80+2) copies of next byte
     *
     * @param {Uint8Array} data - Data to compress
     * @return {RLEResult} Compression result
     */
    static compressRLE(data) {
        if (!data || data.length === 0) {
            return {
                data: new Uint8Array(0),
                compressed: false,
                originalSize: 0,
                compressedSize: 0,
                ratio: 1.0,
            };
        }

        // Worst case: no compression possible, need 2 bytes per input byte
        const maxOutputSize = data.length * 2;
        const output = this.#memoryPool.acquire(maxOutputSize);
        let outputIndex = 0;

        let i = 0;
        while (i < data.length) {
            const currentByte = data[i];
            let runLength = 1;

            // Count consecutive identical bytes
            while (
                i + runLength < data.length &&
                data[i + runLength] === currentByte &&
                runLength < this.MAX_RLE_RUN
            ) {
                runLength++;
            }

            if (runLength >= 2) {
                // Encode as run: [0x80 + (runLength - 2), byte]
                // This encodes runs of 2-129 bytes
                if (runLength > 129) {
                    runLength = 129; // Cap at maximum encodable run
                }
                output[outputIndex++] = 0x80 + (runLength - 2);
                output[outputIndex++] = currentByte;
                i += runLength;
            } else {
                // Collect literal bytes (non-repeating)
                const literalStart = i;
                let literalCount = 0;

                while (
                    i < data.length &&
                    literalCount < 128
                ) {
                    // Check if next bytes form a run
                    if (i + 1 < data.length && data[i] === data[i + 1]) {
                        // Check if run is worth encoding (at least 2)
                        let ahead = 2;
                        while (
                            i + ahead < data.length &&
                            data[i + ahead] === data[i] &&
                            ahead < 3
                        ) {
                            ahead++;
                        }
                        if (ahead >= 2) {
                            break; // Stop literals, encode upcoming run
                        }
                    }
                    literalCount++;
                    i++;
                }

                if (literalCount > 0) {
                    // Encode literals: [literalCount - 1, ...bytes]
                    output[outputIndex++] = literalCount - 1;
                    for (let j = 0; j < literalCount; j++) {
                        output[outputIndex++] = data[literalStart + j];
                    }
                }
            }
        }

        const compressedSize = outputIndex;
        const compressed = compressedSize < data.length;

        // If compression didn't help, return original
        if (!compressed) {
            this.#memoryPool.release(output);
            return {
                data: new Uint8Array(data), // Copy to new array
                compressed: false,
                originalSize: data.length,
                compressedSize: data.length,
                ratio: 1.0,
            };
        }

        // Create properly sized result
        const result = new Uint8Array(compressedSize);
        result.set(output.subarray(0, compressedSize));
        this.#memoryPool.release(output);

        return {
            data: result,
            compressed: true,
            originalSize: data.length,
            compressedSize,
            ratio: compressedSize / data.length,
        };
    }

    /**
     * Decompress RLE data (for testing/verification)
     * @param {Uint8Array} data - RLE compressed data
     * @return {Uint8Array} Decompressed data
     */
    static decompressRLE(data) {
        if (!data || data.length === 0) {
            return new Uint8Array(0);
        }

        // Estimate output size (may need to grow)
        const chunks = [];
        let i = 0;

        while (i < data.length) {
            const control = data[i++];

            if (control >= 0x80) {
                // Run: repeat next byte (control - 0x80 + 2) times
                const runLength = control - 0x80 + 2;
                const value = data[i++];
                const run = new Uint8Array(runLength);
                run.fill(value);
                chunks.push(run);
            } else {
                // Literals: copy (control + 1) bytes
                const literalCount = control + 1;
                chunks.push(data.slice(i, i + literalCount));
                i += literalCount;
            }
        }

        // Concatenate chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result;
    }

    /**
     * Generate payload chunks for streaming transmission
     * Yields metadata-rich chunks for progress tracking and retry logic
     *
     * @param {Uint8Array} payload - Complete payload to chunk
     * @param {number} [chunkSize=512] - Size of each chunk in bytes
     * @yields {ChunkInfo} Chunk with metadata
     */
    static * generateChunks(payload, chunkSize = this.DEFAULT_CHUNK_SIZE) {
        if (!payload || payload.length === 0) {
            return;
        }

        if (chunkSize <= 0) {
            throw new Error('ImageEncoder: chunkSize must be positive');
        }

        const totalBytes = payload.length;
        const totalChunks = Math.ceil(totalBytes / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const byteOffset = i * chunkSize;
            const endOffset = Math.min(byteOffset + chunkSize, totalBytes);
            const chunk = payload.subarray(byteOffset, endOffset);

            yield {
                chunk,
                index: i,
                total: totalChunks,
                isLast: i === totalChunks - 1,
                byteOffset,
                totalBytes,
            };
        }
    }

    /**
     * Async generator for chunked transmission with backpressure support
     *
     * @param {Uint8Array} payload - Complete payload to chunk
     * @param {number} [chunkSize=512] - Size of each chunk in bytes
     * @param {Function} [onChunkReady] - Optional callback before yielding each chunk
     * @yields {ChunkInfo} Chunk with metadata
     */
    static async* generateChunksAsync(payload, chunkSize = this.DEFAULT_CHUNK_SIZE, onChunkReady) {
        if (!payload || payload.length === 0) {
            return;
        }

        if (chunkSize <= 0) {
            throw new Error('ImageEncoder: chunkSize must be positive');
        }

        const totalBytes = payload.length;
        const totalChunks = Math.ceil(totalBytes / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const byteOffset = i * chunkSize;
            const endOffset = Math.min(byteOffset + chunkSize, totalBytes);
            const chunk = payload.subarray(byteOffset, endOffset);

            const chunkInfo = {
                chunk,
                index: i,
                total: totalChunks,
                isLast: i === totalChunks - 1,
                byteOffset,
                totalBytes,
            };

            if (onChunkReady) {
                await onChunkReady(chunkInfo);
            }

            yield chunkInfo;
        }
    }

    /**
     * Concatenate multiple Uint8Arrays efficiently
     * Avoids spread operator and intermediate arrays
     *
     * @param {Uint8Array[]} arrays - Arrays to concatenate
     * @return {Uint8Array} Concatenated result
     */
    static concatenate(...arrays) {
        // Filter out null/undefined and calculate total length
        const validArrays = arrays.filter((arr) => arr && arr.length > 0);
        const totalLength = validArrays.reduce((sum, arr) => sum + arr.length, 0);

        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const arr of validArrays) {
            result.set(arr, offset);
            offset += arr.length;
        }

        return result;
    }

    /**
     * Build ESC/POS raster image command (GS v 0)
     *
     * @param {Uint8Array} rasterData - Raster bitmap data
     * @param {number} widthBytes - Width in bytes
     * @param {number} height - Height in pixels
     * @param {boolean} [useCompression=false] - Use RLE compression (mode 1)
     * @return {{command: Uint8Array, compressed: boolean, ratio: number}}
     */
    static buildRasterCommand(rasterData, widthBytes, height, useCompression = false) {
        let data = rasterData;
        let compressed = false;
        let ratio = 1.0;

        if (useCompression) {
            const rleResult = this.compressRLE(rasterData);
            if (rleResult.compressed) {
                data = rleResult.data;
                compressed = true;
                ratio = rleResult.ratio;
            }
        }

        // GS v 0 command: 1D 76 30 m xL xH yL yH [data]
        // m = 0: normal, m = 1: RLE compressed
        const mode = compressed ? 0x01 : 0x00;
        const header = new Uint8Array([
            0x1d, 0x76, 0x30, mode,
            widthBytes & 0xff, (widthBytes >> 8) & 0xff,
            height & 0xff, (height >> 8) & 0xff,
        ]);

        return {
            command: this.concatenate(header, data),
            compressed,
            ratio,
        };
    }

    /**
     * Build ESC/POS column image command (ESC *)
     *
     * @param {Uint8Array} stripData - Column strip data (width * 3 bytes)
     * @param {number} width - Width in pixels
     * @return {Uint8Array} Complete command for one strip
     */
    static buildColumnCommand(stripData, width) {
        // ESC * m nL nH [data]
        // m = 33 (0x21) for 24-dot double-density
        const header = new Uint8Array([
            0x1b, 0x2a, 0x21,
            width & 0xff, (width >> 8) & 0xff,
        ]);
        const footer = new Uint8Array([0x0a]); // Line feed

        return this.concatenate(header, stripData, footer);
    }

    /**
     * Build line spacing command
     * @param {number} dots - Line spacing in dots (0 for default)
     * @return {Uint8Array}
     */
    static buildLineSpacingCommand(dots) {
        if (dots === 0) {
            // Reset to default: ESC 2
            return new Uint8Array([0x1b, 0x32]);
        }
        // Set line spacing: ESC 3 n
        return new Uint8Array([0x1b, 0x33, dots & 0xff]);
    }

    /**
     * Build Star PRNT column image command (ESC X)
     *
     * @param {Uint8Array} stripData - Column strip data
     * @param {number} width - Width in pixels
     * @return {Uint8Array} Complete command for one strip
     */
    static buildStarColumnCommand(stripData, width) {
        // ESC X nL nH [data] LF CR
        const header = new Uint8Array([
            0x1b, 0x58,
            width & 0xff, (width >> 8) & 0xff,
        ]);
        const footer = new Uint8Array([0x0a, 0x0d]); // LF CR

        return this.concatenate(header, stripData, footer);
    }

    /**
     * Release memory pool resources
     * Call this when encoder is no longer needed
     */
    static releasePool() {
        this.#memoryPool.clear();
    }

    /**
     * Process image asynchronously with yielding for large images
     * Prevents UI blocking on main thread
     *
     * @param {ImageData} image - Source image
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @param {'column'|'raster'} mode - Encoding mode
     * @param {Object} [options] - Processing options
     * @param {boolean} [options.useCompression=false] - Use RLE compression
     * @param {number} [options.yieldInterval=1000] - Yield every N pixels
     * @return {Promise<{commands: Uint8Array[], compressed: boolean}>}
     */
    static async processImageAsync(image, width, height, mode, options = {}) {
        const { useCompression = false } = options;

        this.validateImage(image);

        const commands = [];
        let compressed = false;

        if (mode === 'raster') {
            // For raster mode, process in horizontal strips
            const widthBytes = width >> 3;
            const stripHeight = 50; // Process 50 rows at a time
            const totalStrips = Math.ceil(height / stripHeight);

            const allData = this.#memoryPool.acquire(widthBytes * height);
            let processedRows = 0;

            for (let strip = 0; strip < totalStrips; strip++) {
                const startY = strip * stripHeight;
                const endY = Math.min(startY + stripHeight, height);

                for (let y = startY; y < endY; y++) {
                    const rowOffset = y * widthBytes;
                    for (let x = 0; x < width; x += 8) {
                        let byte = 0;
                        for (let b = 0; b < 8; b++) {
                            byte |= this.getPixel(image, x + b, y, width, height) << (7 - b);
                        }
                        allData[rowOffset + (x >> 3)] = byte;
                    }
                    processedRows++;

                    // Yield control periodically
                    if (processedRows % 50 === 0) {
                        await new Promise((resolve) => setTimeout(resolve, 0));
                    }
                }
            }

            const rasterData = allData.subarray(0, widthBytes * height);
            const result = this.buildRasterCommand(rasterData, widthBytes, height, useCompression);
            commands.push(result.command);
            compressed = result.compressed;

            this.#memoryPool.release(allData);
        } else {
            // Column mode
            commands.push(this.buildLineSpacingCommand(36)); // 24-dot spacing

            const totalStrips = Math.ceil(height / 24);

            for (let s = 0; s < totalStrips; s++) {
                const stripY = s * 24;
                const bytesPerStrip = width * 3;
                const strip = new Uint8Array(bytesPerStrip);

                for (let x = 0; x < width; x++) {
                    const offset = x * 3;

                    for (let c = 0; c < 3; c++) {
                        let byte = 0;
                        for (let b = 0; b < 8; b++) {
                            byte |= this.getPixel(image, x, stripY + (c * 8) + b, width, height) << (7 - b);
                        }
                        strip[offset + c] = byte;
                    }

                    // Yield control periodically
                    if (x % 100 === 0 && x > 0) {
                        await new Promise((resolve) => setTimeout(resolve, 0));
                    }
                }

                commands.push(this.buildColumnCommand(strip, width));
            }

            commands.push(this.buildLineSpacingCommand(0)); // Reset to default
        }

        return { commands, compressed };
    }
}

export default ImageEncoder;
export { ImageEncoder, MemoryPool };

