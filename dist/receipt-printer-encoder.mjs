import CodepageEncoder from '@point-of-sale/codepage-encoder';

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

/**
 * ESC/POS Language commands
 */
class LanguageEscPos {
  /**
     * Initialize the printer
     * @return {Array}         Array of bytes to send to the printer
     */
  initialize() {
    return [
      {
        type: 'initialize',
        payload: [0x1b, 0x40],
      },
      {
        type: 'character-mode',
        value: 'single byte',
        payload: [0x1c, 0x2e],
      },
      {
        type: 'font',
        value: 'A',
        payload: [0x1b, 0x4d, 0x00],
      },
    ];
  }

  /**
     * Change the font
     * @param {string} value    Font type ('A', 'B', or more)
     * @return {Array}         Array of bytes to send to the printer
     */
  font(value) {
    const type = value.charCodeAt(0) - 0x41;

    return [
      {
        type: 'font',
        value,
        payload: [0x1b, 0x4d, type],
      },
    ];
  }

  /**
     * Change the alignment
     * @param {string} value    Alignment value ('left', 'center', 'right')
     * @return {Array}         Array of bytes to send to the printer
     */
  align(value) {
    let align = 0x00;

    if (value === 'center') {
      align = 0x01;
    } else if (value === 'right') {
      align = 0x02;
    }

    return [
      {
        type: 'align',
        value,
        payload: [0x1b, 0x61, align],
      },
    ];
  }

  /**
     * Generate a barcode
     * @param {string} value        Value to encode
     * @param {string|number} symbology    Barcode symbology
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  barcode(value, symbology, options) {
    const result = [];

    const symbologies = {
      'upca': 0x00,
      'upce': 0x01,
      'ean13': 0x02,
      'ean8': 0x03,
      'code39': 0x04,
      'coda39': 0x04, /* typo, leave here for backwards compatibility */
      'itf': 0x05,
      'interleaved-2-of-5': 0x05,
      'nw-7': 0x06,
      'codabar': 0x06,
      'code93': 0x48,
      'code128': 0x49,
      'gs1-128': 0x48,
      'gs1-databar-omni': 0x4b,
      'gs1-databar-truncated': 0x4c,
      'gs1-databar-limited': 0x4d,
      'gs1-databar-expanded': 0x4e,
      'code128-auto': 0x4f,
    };

    if (typeof symbology === 'string' && typeof symbologies[symbology] === 'undefined') {
      throw new Error(`Symbology '${symbology}' not supported by language`);
    }

    /* Calculate segment width */

    if (options.width < 1 || options.width > 3) {
      throw new Error('Width must be between 1 and 3');
    }

    let width = options.width + 1;

    if (symbology === 'itf') {
      width = options.width * 2;
    }

    if (symbology === 'gs1-128' || symbology === 'gs1-databar-omni' ||
      symbology === 'gs1-databar-truncated' || symbology === 'gs1-databar-limited' ||
      symbology === 'gs1-databar-expanded') {
      width = options.width;
    }

    /* Set barcode options */

    result.push(
      {
        type: 'barcode',
        property: 'height',
        value: options.height,
        payload: [0x1d, 0x68, options.height],
      },
      {
        type: 'barcode',
        property: 'width',
        value: options.width,
        payload: [0x1d, 0x77, width],
      },
      {
        type: 'barcode',
        property: 'text',
        value: options.text,
        payload: [0x1d, 0x48, options.text ? 0x02 : 0x00],
      },
    );


    /* Encode barcode */

    if (symbology == 'code128' && !value.startsWith('{')) {
      value = '{B' + value;
    }

    if (symbology == 'gs1-128') {
      value = value.replace(/[()*]/g, '');
    }

    const bytes = CodepageEncoder.encode(value, 'ascii');

    const identifier = typeof symbology === 'string' ? symbologies[symbology] : symbology;

    if (identifier > 0x40) {
      /* Function B symbologies */

      result.push(
        {
          type: 'barcode',
          value: { symbology: symbology, data: value },
          payload: [0x1d, 0x6b, identifier, bytes.length, ...bytes],
        },
      );
    } else {
      /* Function A symbologies */

      result.push(
        {
          type: 'barcode',
          value: { symbology: symbology, data: value },
          payload: [0x1d, 0x6b, identifier, ...bytes, 0x00],
        },
      );
    }

    return result;
  }

  /**
     * Generate a QR code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  qrcode(value, options) {
    const result = [];

    /* Model */

    if (typeof options.model === 'number') {
      const models = {
        1: 0x31,
        2: 0x32,
      };

      if (options.model in models) {
        result.push(
          {
            type: 'qrcode',
            property: 'model',
            value: options.model,
            payload: [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, models[options.model], 0x00],
          },
        );
      } else {
        throw new Error('Model must be 1 or 2');
      }
    }

    /* Size */

    if (typeof options.size !== 'number') {
      throw new Error('Size must be a number');
    }

    if (options.size < 1 || options.size > 8) {
      throw new Error('Size must be between 1 and 8');
    }

    result.push(
      {
        type: 'qrcode',
        property: 'size',
        value: options.size,
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, options.size],
      },
    );

    /* Error level */

    const errorlevels = {
      'l': 0x30,
      'm': 0x31,
      'q': 0x32,
      'h': 0x33,
    };

    if (options.errorlevel in errorlevels) {
      result.push(
        {
          type: 'qrcode',
          property: 'errorlevel',
          value: options.errorlevel,
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, errorlevels[options.errorlevel]],
        },
      );
    } else {
      throw new Error('Error level must be l, m, q or h');
    }

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'iso8859-1');
    const length = bytes.length + 3;

    result.push(
      {
        type: 'qrcode',
        property: 'data',
        value,
        payload: [0x1d, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes],
      },
    );

    /* Print QR code */

    result.push(
      {
        type: 'qrcode',
        command: 'print',
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30],
      },
    );

    return result;
  }

  /**
     * Generate a PDF417 code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  pdf417(value, options) {
    const result = [];

    /* Columns */

    if (typeof options.columns !== 'number') {
      throw new Error('Columns must be a number');
    }

    if (options.columns !== 0 && (options.columns < 1 || options.columns > 30)) {
      throw new Error('Columns must be 0, or between 1 and 30');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'columns',
        value: options.columns,
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x41, options.columns],
      },
    );

    /* Rows */

    if (typeof options.rows !== 'number') {
      throw new Error('Rows must be a number');
    }

    if (options.rows !== 0 && (options.rows < 3 || options.rows > 90)) {
      throw new Error('Rows must be 0, or between 3 and 90');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'rows',
        value: options.rows,
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x42, options.rows],
      },
    );

    /* Width */

    if (typeof options.width !== 'number') {
      throw new Error('Width must be a number');
    }

    if (options.width < 2 || options.width > 8) {
      throw new Error('Width must be between 2 and 8');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'width',
        value: options.width,
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x43, options.width],
      },
    );

    /* Height */

    if (typeof options.height !== 'number') {
      throw new Error('Height must be a number');
    }

    if (options.height < 2 || options.height > 8) {
      throw new Error('Height must be between 2 and 8');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'height',
        value: options.height,
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x44, options.height],
      },
    );

    /* Error level */

    if (typeof options.errorlevel !== 'number') {
      throw new Error('Errorlevel must be a number');
    }

    if (options.errorlevel < 0 || options.errorlevel > 8) {
      throw new Error('Errorlevel must be between 0 and 8');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'errorlevel',
        value: options.errorlevel,
        payload: [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x30, 0x45, 0x30, options.errorlevel + 0x30],
      },
    );

    /* Model: standard or truncated */

    result.push(
      {
        type: 'pdf417',
        property: 'truncated',
        value: !!options.truncated,
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x46, options.truncated ? 0x01 : 0x00],
      },
    );

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'ascii');
    const length = bytes.length + 3;

    result.push(
      {
        type: 'pdf417',
        property: 'data',
        value,
        payload: [0x1d, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x30, 0x50, 0x30, ...bytes],
      },
    );

    /* Print PDF417 code */

    result.push(
      {
        type: 'pdf417',
        command: 'print',
        payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x51, 0x30],
      },
    );

    return result;
  }

  /**
     * Encode an image
     * @param {ImageData} image     ImageData object
     * @param {number} width        Width of the image
     * @param {number} height       Height of the image
     * @param {string} mode         Image encoding mode ('column' or 'raster')
     * @param {Object} [options]    Additional options
     * @param {boolean} [options.supportsCompression=false] Use RLE compression if supported
     * @return {Array|Promise}     Array of bytes to send to the printer, or Promise for async processing
     */
  image(image, width, height, mode, options = {}) {
    const { supportsCompression = false } = options;

    // Size thresholds for async processing
    const totalPixels = width * height;
    const isLargeImage = totalPixels > 250000;
    const isWideImage = width > 800;
    const shouldUseAsync = isLargeImage || isWideImage;

    if (shouldUseAsync) {
      return this._processImageAsync(image, width, height, mode, supportsCompression);
    }

    return this._processImageSync(image, width, height, mode, supportsCompression);
  }

  /**
   * Process image synchronously (for smaller images)
   * Uses strip-based encoding for raster mode to handle large images efficiently.
   * @param {ImageData} image - Image data object
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {string} mode - Encoding mode ('column' or 'raster')
   * @param {boolean} useCompression - Whether to use RLE compression
   * @return {Array} Array of command objects
   * @private
   */
  _processImageSync(image, width, height, mode, useCompression) {
    const result = [];

    if (mode === 'raster') {
      // Use strip-based encoding for all images to handle large receipts
      // Each strip generates a separate GS v 0 command - printers handle as continuous print
      const { strips } = ImageEncoder.pixelsToRasterStrips(
        image,
        width,
        height,
        ImageEncoder.IMAGE_STRIP_HEIGHT,
      );

      for (const strip of strips) {
        const command = ImageEncoder.buildRasterCommand(
          strip.data,
          strip.widthBytes,
          strip.height,
          useCompression,
        );

        result.push({
          type: 'image',
          command: 'raster',
          value: 'raster',
          width,
          height: strip.height,
          compressed: command.compressed,
          compressionRatio: command.ratio,
          payload: command.command, // Keep as Uint8Array to avoid memory duplication
        });
      }
    } else {
      // Column mode (ESC *)
      const strips = ImageEncoder.pixelsToColumns(image, width, height);

      // Set 24-dot line spacing
      result.push({
        type: 'line-spacing',
        value: '24 dots',
        payload: [0x1b, 0x33, 0x24],
      });

      for (const stripData of strips) {
        const command = ImageEncoder.buildColumnCommand(stripData, width);
        result.push({
          type: 'image',
          property: 'data',
          value: 'column',
          width,
          height: 24,
          payload: command, // Keep as Uint8Array to avoid memory duplication
        });
      }

      // Reset line spacing
      result.push({
        type: 'line-spacing',
        value: 'default',
        payload: [0x1b, 0x32],
      });
    }

    return result;
  }

  /**
   * Process image asynchronously (for larger images)
   * Prevents UI blocking and reduces memory pressure.
   * Uses strip-based encoding for raster mode to handle very large images.
   * @param {ImageData} image - Image data object
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {string} mode - Encoding mode ('column' or 'raster')
   * @param {boolean} useCompression - Whether to use RLE compression
   * @return {Promise<Array>} Promise resolving to array of command objects
   * @private
   */
  async _processImageAsync(image, width, height, mode, useCompression) {
    const result = [];

    if (mode === 'raster') {
      // Use strip-based encoding for large images to prevent memory issues
      const { strips } = ImageEncoder.pixelsToRasterStrips(
        image,
        width,
        height,
        ImageEncoder.IMAGE_STRIP_HEIGHT,
      );

      for (let i = 0; i < strips.length; i++) {
        const strip = strips[i];
        const command = ImageEncoder.buildRasterCommand(
          strip.data,
          strip.widthBytes,
          strip.height,
          useCompression,
        );

        result.push({
          type: 'image',
          command: 'raster',
          value: 'raster',
          width,
          height: strip.height,
          compressed: command.compressed,
          compressionRatio: command.ratio,
          payload: command.command, // Keep as Uint8Array to avoid memory duplication
        });

        // Yield control periodically to prevent UI blocking
        if (i % 4 === 0 && i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } else {
      // Column mode - use existing processImageAsync for column strips
      const { commands } = await ImageEncoder.processImageAsync(
        image,
        width,
        height,
        mode,
        { useCompression },
      );

      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];

        if (i === 0) {
          // First command is line spacing
          result.push({
            type: 'line-spacing',
            value: '24 dots',
            payload: command, // Keep as Uint8Array to avoid memory duplication
          });
        } else if (i === commands.length - 1) {
          // Last command is line spacing reset
          result.push({
            type: 'line-spacing',
            value: 'default',
            payload: command, // Keep as Uint8Array to avoid memory duplication
          });
        } else {
          result.push({
            type: 'image',
            property: 'data',
            value: 'column',
            width,
            height: 24,
            payload: command, // Keep as Uint8Array to avoid memory duplication
          });
        }
      }
    }

    return result;
  }

  /**
     * Cut the paper
     * @param {string} value    Cut type ('full' or 'partial')
     * @return {Array}         Array of bytes to send to the printer
     */
  cut(value) {
    let data = 0x00;

    if (value == 'partial') {
      data = 0x01;
    }

    return [
      {
        type: 'cut',
        payload: [0x1d, 0x56, data],
      },
    ];
  }

  /**
     * Send a pulse to the cash drawer
     * @param {number} device   Device number
     * @param {number} on       Pulse ON time
     * @param {number} off      Pulse OFF time
     * @return {Array}         Array of bytes to send to the printer
     */
  pulse(device, on, off) {
    if (typeof device === 'undefined') {
      device = 0;
    }

    if (typeof on === 'undefined') {
      on = 100;
    }

    if (typeof off === 'undefined') {
      off = 500;
    }

    on = Math.min(500, Math.round(on / 2));
    off = Math.min(500, Math.round(off / 2));


    return [
      {
        type: 'pulse',
        payload: [0x1b, 0x70, device ? 1 : 0, on & 0xff, off & 0xff],
      },
    ];
  }

  /**
     * Enable or disable bold text
     * @param {boolean} value   Enable or disable bold text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  bold(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x45, data,
    ];
  }

  /**
     * Enable or disable underline text
     * @param {boolean} value   Enable or disable underline text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  underline(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x2d, data,
    ];
  }

  /**
     * Enable or disable italic text
     * @param {boolean} value   Enable or disable italic text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  italic(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x34, data,
    ];
  }

  /**
     * Enable or disable inverted text
     * @param {boolean} value   Enable or disable inverted text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  invert(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1d, 0x42, data,
    ];
  }

  /**
     * Change text size
     * @param {number} width    Width of the text (1-8)
     * @param {number} height   Height of the text (1-8)
     * @return {Array}         Array of bytes to send to the printer
     */
  size(width, height) {
    return [
      0x1d, 0x21, (height - 1) | (width - 1) << 4,
    ];
  }

  /**
     * Change the codepage
     * @param {number} value    Codepage value
     * @return {Array}         Array of bytes to send to the printer
     */
  codepage(value) {
    return [
      0x1b, 0x74, value,
    ];
  }

  /**
     * Flush the printers line buffer
     * @return {Array}         Array of bytes to send to the printer
     */
  flush() {
    return [];
  }
}

/**
 * StarPRNT Language commands
 */
class LanguageStarPrnt {
  /**
     * Initialize the printer
     * @return {Array}         Array of bytes to send to the printer
     */
  initialize() {
    return [
      {
        type: 'initialize',
        payload: [0x1b, 0x40, 0x18],
      },
    ];
  }

  /**
     * Change the font
     * @param {string} value     Font type ('A', 'B' or 'C')
     * @return {Array}         Array of bytes to send to the printer
     */
  font(value) {
    let type = 0x00;

    if (value === 'B') {
      type = 0x01;
    }

    if (value === 'C') {
      type = 0x02;
    }

    return [
      {
        type: 'font',
        value,
        payload: [0x1b, 0x1e, 0x46, type],
      },
    ];
  }

  /**
     * Change the alignment
     * @param {string} value    Alignment value ('left', 'center', 'right')
     * @return {Array}         Array of bytes to send to the printer
     */
  align(value) {
    let align = 0x00;

    if (value === 'center') {
      align = 0x01;
    } else if (value === 'right') {
      align = 0x02;
    }

    return [
      {
        type: 'align',
        value,
        payload: [0x1b, 0x1d, 0x61, align],
      },
    ];
  }

  /**
     * Generate a barcode
     * @param {string} value        Value to encode
     * @param {string|number} symbology    Barcode symbology
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  barcode(value, symbology, options) {
    const result = [];

    const symbologies = {
      'upce': 0x00,
      'upca': 0x01,
      'ean8': 0x02,
      'ean13': 0x03,
      'code39': 0x04,
      'itf': 0x05,
      'interleaved-2-of-5': 0x05,
      'code128': 0x06,
      'code93': 0x07,
      'nw-7': 0x08,
      'codabar': 0x08,
      'gs1-128': 0x09,
      'gs1-databar-omni': 0x0a,
      'gs1-databar-truncated': 0x0b,
      'gs1-databar-limited': 0x0c,
      'gs1-databar-expanded': 0x0d,
    };

    if (typeof symbology === 'string' && typeof symbologies[symbology] === 'undefined') {
      throw new Error(`Symbology '${symbology}' not supported by language`);
    }

    if (options.width < 1 || options.width > 3) {
      throw new Error('Width must be between 1 and 3');
    }

    /* Selecting mode A, B or C for Code128 is not supported for StarPRNT, so ignore it and let the printer choose */

    if (symbology === 'code128' && value.startsWith('{')) {
      value = value.slice(2);
    }

    /* Encode the barcode value */

    const bytes = CodepageEncoder.encode(value, 'ascii');

    const identifier = typeof symbology === 'string' ? symbologies[symbology] : symbology;

    result.push(
      {
        type: 'barcode',
        value: { symbology: symbology, data: value, width: options.width, height: options.height, text: options.text },
        payload: [
          0x1b, 0x62,
          identifier,
          options.text ? 0x02 : 0x01,
          options.width,
          options.height,
          ...bytes, 0x1e,
        ],
      },
    );

    return result;
  }

  /**
     * Generate a QR code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  qrcode(value, options) {
    const result = [];

    /* Model */

    const models = {
      1: 0x01,
      2: 0x02,
    };

    if (options.model in models) {
      result.push(
        {
          type: 'qrcode',
          property: 'model',
          value: options.model,
          payload: [0x1b, 0x1d, 0x79, 0x53, 0x30, models[options.model]],
        },
      );
    } else {
      throw new Error('Model must be 1 or 2');
    }

    /* Size */

    if (typeof options.size !== 'number') {
      throw new Error('Size must be a number');
    }

    if (options.size < 1 || options.size > 8) {
      throw new Error('Size must be between 1 and 8');
    }

    result.push(
      {
        type: 'qrcode',
        property: 'size',
        value: options.size,
        payload: [0x1b, 0x1d, 0x79, 0x53, 0x32, options.size],
      },
    );

    /* Error level */

    const errorlevels = {
      'l': 0x00,
      'm': 0x01,
      'q': 0x02,
      'h': 0x03,
    };

    if (options.errorlevel in errorlevels) {
      result.push(
        {
          type: 'qrcode',
          property: 'errorlevel',
          value: options.errorlevel,
          payload: [0x1b, 0x1d, 0x79, 0x53, 0x31, errorlevels[options.errorlevel]],
        },
      );
    } else {
      throw new Error('Error level must be l, m, q or h');
    }

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'iso8859-1');
    const length = bytes.length;

    result.push(
      {
        type: 'qrcode',
        property: 'data',
        value,
        payload: [
          0x1b, 0x1d, 0x79, 0x44, 0x31, 0x00,
          length & 0xff, (length >> 8) & 0xff,
          ...bytes,
        ],
      },
    );

    /* Print QR code */

    result.push(
      {
        type: 'qrcode',
        command: 'print',
        payload: [0x1b, 0x1d, 0x79, 0x50],
      },
    );

    return result;
  }

  /**
     * Generate a PDF417 code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  pdf417(value, options) {
    const result = [];

    /* Columns and Rows */

    if (typeof options.columns !== 'number') {
      throw new Error('Columns must be a number');
    }

    if (options.columns !== 0 && (options.columns < 1 || options.columns > 30)) {
      throw new Error('Columns must be 0, or between 1 and 30');
    }

    if (typeof options.rows !== 'number') {
      throw new Error('Rows must be a number');
    }

    if (options.rows !== 0 && (options.rows < 3 || options.rows > 90)) {
      throw new Error('Rows must be 0, or between 3 and 90');
    }

    result.push(
      {
        type: 'pdf417',
        value: `rows: ${options.rows}, columns: ${options.columns}`,
        payload: [0x1b, 0x1d, 0x78, 0x53, 0x30, 0x01, options.rows, options.columns],
      },
    );

    /* Width */

    if (typeof options.width !== 'number') {
      throw new Error('Width must be a number');
    }

    if (options.width < 2 || options.width > 8) {
      throw new Error('Width must be between 2 and 8');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'width',
        value: options.width,
        payload: [0x1b, 0x1d, 0x78, 0x53, 0x32, options.width],
      },
    );

    /* Height */

    if (typeof options.height !== 'number') {
      throw new Error('Height must be a number');
    }

    if (options.height < 2 || options.height > 8) {
      throw new Error('Height must be between 2 and 8');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'height',
        value: options.height,
        payload: [0x1b, 0x1d, 0x78, 0x53, 0x33, options.height],
      },
    );

    /* Error level */

    if (typeof options.errorlevel !== 'number') {
      throw new Error('Errorlevel must be a number');
    }

    if (options.errorlevel < 0 || options.errorlevel > 8) {
      throw new Error('Errorlevel must be between 0 and 8');
    }

    result.push(
      {
        type: 'pdf417',
        property: 'errorlevel',
        value: options.errorlevel,
        payload: [0x1b, 0x1d, 0x78, 0x53, 0x31, options.errorlevel],
      },
    );

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'ascii');
    const length = bytes.length;

    result.push(
      {
        type: 'pdf417',
        property: 'data',
        value,
        payload: [
          0x1b, 0x1d, 0x78, 0x44,
          length & 0xff, (length >> 8) & 0xff,
          ...bytes,
        ],
      },
    );

    /* Print PDF417 code */

    result.push(
      {
        type: 'pdf417',
        command: 'print',
        payload: [0x1b, 0x1d, 0x78, 0x50],
      },
    );

    return result;
  }

  /**
     * Encode an image
     * @param {ImageData} image     ImageData object
     * @param {number} width        Width of the image
     * @param {number} height       Height of the image
     * @param {Object} [options]    Additional options
     * @param {boolean} [options.supportsCompression=false] Use compression if supported (Star-specific)
     * @return {Array|Promise}     Array of bytes to send to the printer, or Promise for async processing
     */
  image(image, width, height, options = {}) {
    // Size thresholds for async processing
    const totalPixels = width * height;
    const memoryFootprint = width * Math.ceil(height / 24) * 3;
    const isLargeImage = totalPixels > 250000;
    const isWideImage = width > 800;
    const isHighMemoryUsage = memoryFootprint > 500000;
    const shouldUseAsync = isLargeImage || isWideImage || isHighMemoryUsage;

    if (shouldUseAsync) {
      return this._processImageAsync(image, width, height);
    }

    return this._processImageSync(image, width, height);
  }

  /**
   * Process image synchronously (for smaller images)
   * @param {ImageData} image - Image data object
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @return {Array} Array of command objects
   * @private
   */
  _processImageSync(image, width, height) {
    const result = [];
    const strips = ImageEncoder.pixelsToColumns(image, width, height);

    for (const stripData of strips) {
      const command = ImageEncoder.buildStarColumnCommand(stripData, width);
      result.push({
        type: 'image',
        property: 'data',
        value: 'column',
        width,
        height: 24,
        payload: command, // Keep as Uint8Array to avoid memory duplication
      });
    }

    return result;
  }

  /**
   * Process image asynchronously (for larger images)
   * Prevents UI blocking and reduces memory pressure
   * @param {ImageData} image - Image data object
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @return {Promise<Array>} Promise resolving to array of command objects
   * @private
   */
  async _processImageAsync(image, width, height) {
    // Process image in column strips asynchronously
    const result = [];
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
            byte |= ImageEncoder.getPixel(image, x, stripY + (c * 8) + b, width, height) << (7 - b);
          }
          strip[offset + c] = byte;
        }

        // Yield control periodically to prevent blocking
        if (x % 100 === 0 && x > 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const starCommand = ImageEncoder.buildStarColumnCommand(strip, width);
      result.push({
        type: 'image',
        property: 'data',
        value: 'column',
        width,
        height: 24,
        payload: starCommand, // Keep as Uint8Array to avoid memory duplication
      });
    }

    return result;
  }

  /**
     * Cut the paper
     * @param {string} value    Cut type ('full' or 'partial')
     * @return {Array}         Array of bytes to send to the printer
     */
  cut(value) {
    let data = 0x00;

    if (value == 'partial') {
      data = 0x01;
    }

    return [
      {
        type: 'cut',
        payload: [0x1b, 0x64, data],
      },
    ];
  }

  /**
     * Send a pulse to the cash drawer
     * @param {number} device   Device number
     * @param {number} on       Pulse ON time
     * @param {number} off      Pulse OFF time
     * @return {Array}         Array of bytes to send to the printer
     */
  pulse(device, on, off) {
    if (typeof device === 'undefined') {
      device = 0;
    }

    if (typeof on === 'undefined') {
      on = 200;
    }

    if (typeof off === 'undefined') {
      off = 200;
    }

    on = Math.min(127, Math.round(on / 10));
    off = Math.min(127, Math.round(off / 10));

    return [
      {
        type: 'pulse',
        payload: [0x1b, 0x07, on & 0xff, off & 0xff, device ? 0x1a : 0x07],
      },
    ];
  }

  /**
     * Enable or disable bold text
     * @param {boolean} value   Enable or disable bold text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  bold(value) {
    let data = 0x46;

    if (value) {
      data = 0x45;
    }

    return [
      0x1b, data,
    ];
  }

  /**
     * Enable or disable underline text
     * @param {boolean} value   Enable or disable underline text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  underline(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x2d, data,
    ];
  }

  /**
     * Enable or disable italic text
     * @param {boolean} value   Enable or disable italic text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  italic(value) {
    return [];
  }

  /**
     * Enable or disable inverted text
     * @param {boolean} value   Enable or disable inverted text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  invert(value) {
    let data = 0x35;

    if (value) {
      data = 0x34;
    }

    return [
      0x1b, data,
    ];
  }

  /**
     * Change text size
     * @param {number} width    Width of the text (1-8)
     * @param {number} height   Height of the text (1-8)
     * @return {Array}         Array of bytes to send to the printer
     */
  size(width, height) {
    return [
      0x1b, 0x69, height - 1, width - 1,
    ];
  }

  /**
     * Change the codepage
     * @param {number} value    Codepage value
     * @return {Array}         Array of bytes to send to the printer
     */
  codepage(value) {
    return [
      0x1b, 0x1d, 0x74, value,
    ];
  }

  /**
     * Flush the printers line buffer
     * @return {Array}         Array of bytes to send to the printer
     */
  flush() {
    return [
      {
        type: 'print-mode',
        value: 'page',
        payload: [0x1b, 0x1d, 0x50, 0x30],
      },
      {
        type: 'print-mode',
        value: 'line',
        payload: [0x1b, 0x1d, 0x50, 0x31],
      },
    ];
  }
}

/**
 * Store and manage text styles
 */
class TextStyle {
  #default = {
    bold: false,
    italic: false,
    underline: false,
    invert: false,
    width: 1,
    height: 1,
  };

  #current;
  #callback;

  /**
     * Create a new TextStyle object
     *
     * @param  {object}   options   Object containing configuration options
     */
  constructor(options) {
    this.#current = structuredClone(this.#default);
    this.#callback = options.callback || (() => {});
  }

  /**
     * Return commands to get to the default style from the current style
     *
     * @return {array}   Array of modified properties
     */
  store() {
    const result = [];

    const properties = new Map();

    for (const property in this.#current) {
      if (this.#current[property] !== this.#default[property]) {
        if (property === 'width' || property === 'height') {
          properties.set('size', {width: this.#default.width, height: this.#default.height});
        } else {
          properties.set(property, this.#default[property]);
        }
      }
    }

    for (const property of properties) {
      result.push({
        type: 'style',
        property: property[0],
        value: property[1],
      });
    }

    return result;
  }

  /**
     * Return commands to get to the current style from the default style
     *
     * @return {array}   Array of modified properties
     */
  restore() {
    const result = [];

    const properties = new Map();

    for (const property in this.#current) {
      if (this.#current[property] !== this.#default[property]) {
        if (property === 'width' || property === 'height') {
          properties.set('size', {width: this.#current.width, height: this.#current.height});
        } else {
          properties.set(property, this.#current[property]);
        }
      }
    }

    for (const property of properties) {
      result.push({
        type: 'style',
        property: property[0],
        value: property[1],
      });
    }

    return result;
  }

  /**
     * Set the bold property
     *
     * @param  {boolean}   value   Is bold enabled, or not?
     */
  set bold(value) {
    if (value !== this.#current.bold) {
      this.#current.bold = value;

      this.#callback({
        type: 'style',
        property: 'bold',
        value,
      });
    }
  }

  /**
     * Get the bold property
     *
     * @return {boolean}   Is bold enabled, or not?
     */
  get bold() {
    return this.#current.bold;
  }

  /**
     * Set the italic property
     *
     * @param  {boolean}   value   Is italic enabled, or not?
     */
  set italic(value) {
    if (value !== this.#current.italic) {
      this.#current.italic = value;

      this.#callback({
        type: 'style',
        property: 'italic',
        value,
      });
    }
  }

  /**
     * Get the italic property
     *
     * @return {boolean}   Is italic enabled, or not?
     */
  get italic() {
    return this.#current.italic;
  }

  /**
     * Set the underline property
     *
     * @param  {boolean}   value   Is underline enabled, or not?
     */
  set underline(value) {
    if (value !== this.#current.underline) {
      this.#current.underline = value;

      this.#callback({
        type: 'style',
        property: 'underline',
        value,
      });
    }
  }

  /**
     * Get the underline property
     *
     * @return {boolean}   Is underline enabled, or not?
     */
  get underline() {
    return this.#current.underline;
  }

  /**
     * Set the invert property
     *
     * @param  {boolean}   value   Is invert enabled, or not?
     */
  set invert(value) {
    if (value !== this.#current.invert) {
      this.#current.invert = value;

      this.#callback({
        type: 'style',
        property: 'invert',
        value,
      });
    }
  }

  /**
     * Get the invert property
     *
     * @return {boolean}   Is invert enabled, or not?
     */
  get invert() {
    return this.#current.invert;
  }

  /**
    * Set the width property
    *
    * @param  {number}   value   The width of a character
    */
  set width(value) {
    if (value !== this.#current.width) {
      this.#current.width = value;

      this.#callback({
        type: 'style',
        property: 'size',
        value: {width: this.#current.width, height: this.#current.height},
      });
    }
  }

  /**
   * Get the width property
   *
   * @return {number}   The width of a character
   */
  get width() {
    return this.#current.width;
  }

  /**
    * Set the height property
    *
    * @param  {number}   value   The height of a character
    */
  set height(value) {
    if (value !== this.#current.height) {
      this.#current.height = value;

      this.#callback({
        type: 'style',
        property: 'size',
        value: {width: this.#current.width, height: this.#current.height},
      });
    }
  }

  /**
   * Get the height property
   *
   * @return {number}   The height of a character
   */
  get height() {
    return this.#current.height;
  }
}

/**
 * Wrap text into lines of a specified width.
 */
class TextWrap {
  /**
     * Static function to wrap text into lines of a specified width.
     *
     * @param  {string}   value     Text to wrap
     * @param  {object}   options   Object containing configuration options
     * @return {array}              Array of lines
     */
  static wrap(value, options) {
    const result = [];
    let line = [];
    let length = options.indent || 0;
    const width = options.width || 1;
    const columns = options.columns || 42;

    const lines = String(value).split(/\r\n|\n/g);

    for (const value of lines) {
      const chunks = value.match(/[^\s-]+?-\b|\S+|\s+|\r\n?|\n/g) || ['~~empty~~'];

      for (const chunk of chunks) {
        if (chunk === '~~empty~~') {
          result.push(line);
          line = [];
          length = 0;
          continue;
        }

        /* The word does not fit on the line */

        if (length + (chunk.length * width) > columns) {
          /* The word is longer than the line */

          if (chunk.length * width > columns) {
            /* Calculate the remaining space on the line */

            const remaining = columns - length;

            /* Split the word into pieces */

            const letters = chunk.split('');
            let piece;
            const pieces = [];

            /* If there are at least 8 position remaining, break early  */

            if (remaining > 8 * width) {
              piece = letters.splice(0, Math.floor(remaining / width)).join('');

              line.push(piece);
              result.push(line);

              line = [];
              length = 0;
            }

            /* The remaining letters can be split into pieces the size of the width */

            while ((piece = letters.splice(0, Math.floor(columns / width))).length) {
              pieces.push(piece.join(''));
            }

            for (const piece of pieces) {
              if (length + (piece.length * width) > columns) {
                result.push(line);
                line = [];
                length = 0;
              }

              line.push(piece);
              length += piece.length * width;
            }

            continue;
          }

          /* Word fits on the next line */
          result.push(line);
          line = [];
          length = 0;
        }
        line.push(chunk);
        length += chunk.length * width;
      }

      if (line.length > 0) {
        result.push(line);
        line = [];
        length = 0;
      }
    }

    for (let i = 0; i < result.length; i++) {
      result[i] = result[i].join('');

      if (i < result.length - 1) {
        result[i] = result[i].trimEnd();
      }
    }

    return result;
  }
}

/**
 * Compose lines of text and commands
 */
class LineComposer {
  #embedded;
  #columns;
  #align;
  #callback;

  #cursor = 0;
  #stored;
  #buffer = [];


  /**
     * Create a new LineComposer object
     *
     * @param  {object}   options   Object containing configuration options
     */
  constructor(options) {
    this.#embedded = options.embedded || false;
    this.#columns = options.columns || 42;
    this.#align = options.align || 'left';
    this.#callback = options.callback || (() => {});

    this.style = new TextStyle({
      callback: (value) => {
        this.add(value, 0);
      },
    });

    this.#stored = this.style.store();
  }

  /**
     * Add text to the line, potentially wrapping it
     *
     * @param  {string}   value   Text to add to the line
     * @param  {number}   codepage   Codepage to use for the text
     */
  text(value, codepage) {
    const lines = TextWrap.wrap(value, {columns: this.#columns, width: this.style.width, indent: this.#cursor});

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length) {
        /* Add the line to the buffer */
        this.add({type: 'text', value: lines[i], codepage}, lines[i].length * this.style.width);

        /* If it is not the last line, flush the buffer */
        if (i < lines.length - 1) {
          this.flush();
        }
      } else {
        /* In case the line is empty, flush the buffer */
        this.flush({forceNewline: true});
      }
    }
  }

  /**
   * Add spaces to the line
   *
   * @param {number} size Number of spaces to add to the line
   */
  space(size) {
    this.add({type: 'space', size}, size);
  }

  /**
     * Add raw bytes to to the line
     *
     * @param  {array}   value   Array of bytes to add to the line
     * @param  {number}  length  Length in characters of the value
     */
  raw(value, length) {
    this.add({type: 'raw', payload: value}, length || 0);
  }

  /**
     * Add an item to the line buffer, potentially flushing it
     *
     * @param  {object}   value   Item to add to the line buffer
     * @param  {number}   length  Length in characters of the value
     */
  add(value, length) {
    if (value instanceof Array) {
      for (const item of value) {
        this.add(item);
      }

      this.#cursor += length || 0;
      return;
    }

    length = length || 0;

    if (length + this.#cursor > this.#columns) {
      this.flush();
    }

    this.#cursor += length;
    this.#buffer = this.#buffer.concat(value);
  }

  /**
     * Move the cursor to the end of the line, forcing a flush
     * with the next item to add to the line buffer
     */
  end() {
    this.#cursor = this.#columns;
  }

  /**
     * Fetch the contents of line buffer
     *
     * @param  {options}   options   Options for flushing the buffer
     * @return {array}               Array of items in the line buffer
     */
  fetch(options) {
    /* Unless forced keep style changes for the next line */

    if (this.#cursor === 0 && !options.forceNewline && !options.forceFlush) {
      return [];
    }

    /* Check the alignment of the current line */

    const align = {
      current: this.#align,
      next: null,
    };

    for (let i = 0; i < this.#buffer.length - 1; i++) {
      if (this.#buffer[i].type === 'align' && !this.#buffer[i].payload) {
        align.current = this.#buffer[i].value;
      }
    }

    /* Check the last item in the buffer, to see if it changes the alignment, then save it for the next line */

    if (this.#buffer.length) {
      const last = this.#buffer[this.#buffer.length - 1];

      if (last.type === 'align' && !last.payload) {
        align.next = last.value;
      }
    }

    this.#align = align.current;

    /* Create a clean buffer without alignment changes */

    const buffer = this.#buffer.filter((item) => item.type !== 'align' || item.payload);

    /* Fetch the contents of the line buffer */

    let result = [];

    const restore = this.style.restore();
    const store = this.style.store();

    if (this.#cursor === 0 && (options.ignoreAlignment || !this.#embedded)) {
      result = this.#merge([
        ...this.#stored,
        ...buffer,
        ...store,
      ]);
    } else {
      if (this.#align === 'right') {
        let last;

        /* Find index of last text or space element */

        for (let i = buffer.length - 1; i >= 0; i--) {
          if (buffer[i].type === 'text' || buffer[i].type === 'space') {
            last = i;
            break;
          }
        }

        /* Remove trailing spaces from lines */

        if (typeof last === 'number') {
          if (buffer[last].type === 'space' && buffer[last].size > this.style.width) {
            buffer[last].size -= this.style.width;
            this.#cursor -= this.style.width;
          }

          if (buffer[last].type === 'text' && buffer[last].value.endsWith(' ')) {
            buffer[last].value = buffer[last].value.slice(0, -1);
            this.#cursor -= this.style.width;
          }
        }

        result = this.#merge([
          {type: 'space', size: this.#columns - this.#cursor},
          ...this.#stored,
          ...buffer,
          ...store,
        ]);
      }

      if (this.#align === 'center') {
        const left = (this.#columns - this.#cursor) >> 1;

        result = this.#merge([
          {type: 'space', size: left},
          ...this.#stored,
          ...buffer,
          ...store,
          {type: 'space', size: this.#embedded ? this.#columns - this.#cursor - left : 0},
        ]);
      }

      if (this.#align === 'left') {
        result = this.#merge([
          ...this.#stored,
          ...buffer,
          ...store,
          {type: 'space', size: this.#embedded ? this.#columns - this.#cursor : 0},
        ]);
      }
    }

    this.#stored = restore;
    this.#buffer = [];
    this.#cursor = 0;

    if (result.length === 0 && options.forceNewline) {
      result.push({type: 'empty'});
    }

    if (align.next) {
      this.#align = align.next;
    }

    return result;
  }

  /**
     * Flush the contents of the line buffer
     *
     * @param  {options}   options   Options for flushing the buffer
     */
  flush(options) {
    options = Object.assign({
      forceNewline: false,
      forceFlush: false,
      ignoreAlignment: false,
    }, options || {});

    const result = this.fetch(options);

    if (result.length) {
      this.#callback(result);
    }
  }

  /**
     * Merge text items and spaces in the line buffer
     *
     * @param  {array}   items   Array of items
     * @return {array}           Array of merged items
     */
  #merge(items) {
    const result = [];
    let last = -1;

    for (let item of items) {
      if (item.type === 'space') {
        if (item.size === 0) {
          continue;
        }

        item = {type: 'text', value: ' '.repeat(item.size), codepage: null};
      }

      if (item.type === 'text') {
        /* Check if we can merge the text with the last item */

        const allowMerge =
            last >= 0 &&
            result[last].type === 'text' &&
            (
              result[last].codepage === item.codepage ||
              result[last].codepage === null ||
              item.codepage === null
            );

        if (allowMerge) {
          result[last].value += item.value;
          result[last].codepage = result[last].codepage || item.codepage;
          continue;
        }

        result.push(item);
        last++;
      } else if (item.type === 'style' && item.property === 'size') {
        const allowMerge =
          last >= 0 &&
          result[last].type === 'style' &&
          result[last].property === 'size';

        if (allowMerge) {
          result[last].value = item.value;
          continue;
        }

        result.push(item);
        last++;
      } else {
        result.push(item);
        last++;
      }
    }

    return result;
  }

  /**
   * Get the current position of the cursor
   *
   * @return {number}   Current position of the cursor
   */
  get cursor() {
    return this.#cursor;
  }

  /**
   * Set the alignment of the current line
   *
   * @param  {string}   value   Text alignment, can be 'left', 'center', or 'right'
   */
  set align(value) {
    this.add({type: 'align', value}, 0);
  }

  /**
   * Get the alignment of the current line
   *
   * @return {string}   Text alignment, can be 'left', 'center', or 'right'
   */
  get align() {
    let align = this.#align;

    for (let i = 0; i < this.#buffer.length; i++) {
      if (this.#buffer[i].type === 'align') {
        align = this.#buffer[i].value;
      }
    }

    return align;
  }

  /**
   * Set the number of columns of the current line
   *
   * @param  {number}   value   columns of the line
   */
  set columns(value) {
    this.#columns = value;
  }

  /**
   * Get the number of columns of the current line
   *
   * @return {number}   columns of the line
   */
  get columns() {
    return this.#columns;
  }
}

const codepageMappings = {
	'esc-pos': {
		'bixolon/legacy': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,,,,'cp858'],
		'bixolon': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,'windows1252','cp866','cp852','cp858',,'cp862','cp864','thai42','windows1253','windows1254','windows1257',,'windows1251','cp737','cp775','thai14','bixolon/hebrew','windows1255','thai11','thai18','cp885','cp857','iso8859-7','thai16','windows1256','windows1258','khmer',,,,'bixolon/cp866','windows1250',,'tcvn3','tcvn3capitals','viscii'],
		'citizen': ['cp437','epson/katakana','cp858','cp860','cp863','cp865','cp852','cp866','cp857',,,,,,,,'windows1252',,,,,'thai11',,,,,'thai13',,,,'tcvn3','tcvn3capitals','windows1258',,,,,,,,'cp864'],
		'epson/legacy': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,'windows1252','cp866','cp852','cp858'],
		'epson': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,'cp851','cp853','cp857','cp737','iso8859-7','windows1252','cp866','cp852','cp858','thai42','thai11',,,,,'thai13',,,,'tcvn3','tcvn3capitals','cp720','cp775','cp855','cp861','cp862','cp864','cp869','epson/iso8859-2','iso8859-15','cp1098','cp774','cp772','cp1125','windows1250','windows1251','windows1253','windows1254','windows1255','windows1256','windows1257','windows1258','rk1048'],
		'fujitsu': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,'cp857',,,,,,,,'windows1252','cp866','cp852','cp858',,,,,,,'thai13',,,,,,,,,,,,,,'cp864'],
		'hp': ['cp437','cp850','cp852','cp860','cp863','cp865','cp858','cp866','windows1252','cp862','cp737','cp874','cp857','windows1251','windows1255','rk1048'],
		'metapace': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,,,,'cp858'],
		'mpt': ['cp437',,'cp850','cp860','cp863','cp865','windows1251','cp866','cp3021','cp3012'],
		'pos-5890': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','iso8859-1',,'cp862',,,,,,,,'windows1252','cp866','cp852','cp858',,,,'windows1251','cp737','windows1257',,'windows1258','cp864',,,,'windows1255',,,,,,,,,,,,,,,,,,,,,,,,'cp861',,,,'cp855','cp857',,,,'cp851','cp869',,'cp772','cp774',,,'windows1250',,'cp3840',,'cp3843','cp3844','cp3845','cp3846','cp3847','cp3848',,'cp771','cp3001','cp3002','cp3011','cp3012',,'cp3041','windows1253','windows1254','windows1256','cp720',,'cp775'],
		'pos-8360': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','iso8859-1','windows1253','cp862',,,,,,,,'windows1252','cp866','cp852','cp858',,'latvian',,'windows1251','cp737','windows1257',,'windows1258','cp864',,,'pos8360/hebrew','windows1255',,,,,,,,,,,,,,,,,,,,,,,,'cp861',,,,'cp855','cp857',,,,'cp851','cp869',,'cp772','cp774',,,'windows1250',,'cp3840',,'cp3843','cp3844','cp3845','cp3846','cp3847','cp3848',,'cp771','cp3001','cp3002','cp3011','cp3012',,,,'windows1254','windows1256','cp720',,'cp775'],
		'star': ['cp437','star/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,'windows1252','cp866','cp852','cp858','thai42','thai11','thai13','thai14','thai16',,'thai18'],
		'xprinter': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','iso8859-1','windows1253','xprinter/hebrew','cp3012',,'windows1255',,,,,'windows1252','cp866','cp852','cp858',,'latvian','cp864','windows1251','cp737','windows1257',,,,,,,,'windows1256'],
		'youku': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','windows1251','cp866','cp3021','cp3012',,,,,,'cp862','windows1252',,'cp852','cp858',,,'cp864','iso8859-1','cp737','windows1257',,,'cp855','cp857','windows1250','cp775','windows1254','windows1255','windows1256','windows1258',,,'iso8859-1',,,,,,'iso8859-15',,,'cp874'],
	},
	'star-prnt': {
		'star': ['star/standard','cp437','star/katakana',,'cp858','cp852','cp860','cp861','cp863','cp865','cp866','cp855','cp857','cp862','cp864','cp737','cp851','cp869','star/cp928','cp772','cp774','star/cp874',,,,,,,,,,,'windows1252','windows1250','windows1251',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,'cp3840','cp3841','cp3843','cp3844','cp3845','cp3846','cp3847','cp3848','cp1001','cp771','cp3001','cp3002','cp3011','cp3012','cp3021','cp3041'],
	}
};

codepageMappings['star-line'] = codepageMappings['star-prnt'];
codepageMappings['esc-pos']['zijang'] = codepageMappings['esc-pos']['pos-5890'];

const printerDefinitions = {
	'bixolon-srp350': {vendor:'Bixolon',model:'SRP-350',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'bixolon/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:4},images:{supportsCompression:false}}},
	'bixolon-srp350iii': {vendor:'Bixolon',model:'SRP-350III',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'bixolon',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56},C:{size:'9x24',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'citizen-ct-s310ii': {vendor:'Citizen',model:'CT-S310II',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'citizen',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64},C:{size:'8x16',columns:72}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3},images:{supportsCompression:true}}},
	'epson-tm-m30ii': {vendor:'Epson',model:'TM-m30II',interfaces:{usb:{productName:'TM-m30II'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'10x24',columns:57},C:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'epson-tm-m30iii': {vendor:'Epson',model:'TM-m30III',interfaces:{usb:{productName:'TM-m30III'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'10x24',columns:57},C:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'epson-tm-p20ii': {vendor:'Epson',model:'TM-P20II',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42},C:{size:'9x17',columns:42},D:{size:'10x24',columns:38},E:{size:'8x16',columns:48}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},images:{mode:'raster',supportsCompression:true},cutter:{feed:3}}},
	'epson-tm-t20ii': {vendor:'Epson',model:'TM-T20II',interfaces:{usb:{productName:'TM-T20II'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:false}}},
	'epson-tm-t20iii': {vendor:'Epson',model:'TM-T20III',interfaces:{usb:{productName:'TM-T20III'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'epson-tm-t20iv': {vendor:'Epson',model:'TM-T20IV',interfaces:{usb:{productName:'TM-T20IV'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'epson-tm-t70': {vendor:'Epson',model:'TM-T70',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},images:{mode:'raster',supportsCompression:false},cutter:{feed:4}}},
	'epson-tm-t70ii': {vendor:'Epson',model:'TM-T70II','interface':{usb:{productName:'TM-T70II'}},media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},images:{mode:'raster',supportsCompression:true},cutter:{feed:4}}},
	'epson-tm-t88ii': {vendor:'Epson',model:'TM-T88II',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:false}}},
	'epson-tm-t88iii': {vendor:'Epson',model:'TM-T88III',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:false}}},
	'epson-tm-t88iv': {vendor:'Epson',model:'TM-T88IV',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:false}}},
	'epson-tm-t88v': {vendor:'Epson',model:'TM-T88V',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'epson-tm-t88vi': {vendor:'Epson',model:'TM-T88VI',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'epson-tm-t88vii': {vendor:'Epson',model:'TM-T88VII',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:true}}},
	'fujitsu-fp1000': {vendor:'Fujitsu',model:'FP-1000',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'fujitsu',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:56},C:{size:'8x16',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:false},cutter:{feed:4},images:{supportsCompression:true}}},
	'hp-a779': {vendor:'HP',model:'A779',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'hp',newline:'\n',fonts:{A:{size:'12x24',columns:44}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:false,fallback:{type:'barcode',symbology:75}},cutter:{feed:4},images:{supportsCompression:true}}},
	'metapace-t1': {vendor:'Metapace',model:'T-1',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'metapace',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:4},images:{supportsCompression:false}}},
	'mpt-ii': {vendor:'',model:'MPT-II',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'mpt',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64},C:{size:'0x0',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:[]},pdf417:{supported:false},images:{supportsCompression:false}}},
	'pos-5890': {vendor:'',model:'POS-5890',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'pos-5890',fonts:{A:{size:'12x24',columns:32},B:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster',supportsCompression:false},cutter:{feed:1}}},
	'pos-8360': {vendor:'',model:'POS-8360',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'pos-8360',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster',supportsCompression:false},cutter:{feed:4}}},
	'star-mc-print2': {vendor:'Star',model:'mC-Print2',interfaces:{usb:{productName:'mC-Print2'}},media:{dpi:203,width:58},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3},images:{supportsCompression:false}}},
	'star-mpop': {vendor:'Star',model:'mPOP',interfaces:{usb:{productName:'mPOP'}},media:{dpi:203,width:58},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3},images:{supportsCompression:false}}},
	'star-sm-l200': {vendor:'Star',model:'SM-L200',media:{dpi:203,width:58},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42},C:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{supportsCompression:false}}},
	'star-tsp100iii': {vendor:'Star',model:'TSP100III',media:{dpi:203,width:80},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3},images:{supportsCompression:false}}},
	'star-tsp100iv': {vendor:'Star',model:'TSP100IV',media:{dpi:203,width:80},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3},images:{supportsCompression:false}}},
	'star-tsp650': {vendor:'Star',model:'TSP650',media:{dpi:203,width:80},capabilities:{language:'star-line',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:3},images:{supportsCompression:false}}},
	'star-tsp650ii': {vendor:'Star',model:'TSP650II',media:{dpi:203,width:80},capabilities:{language:'star-line',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3},images:{supportsCompression:false}}},
	'xprinter-xp-n160ii': {vendor:'Xprinter',model:'XP-N160II',interfaces:{usb:{productName:'Printer-80\u0000'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'xprinter',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:false}}},
	'xprinter-xp-t80q': {vendor:'Xprinter',model:'XP-T80Q',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'xprinter',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},cutter:{feed:4},images:{supportsCompression:false}}},
	'youku-58t': {vendor:'Youku',model:'58T',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'youku',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:false},images:{supportsCompression:false}}},
};

/**
 * Create a byte stream based on commands for receipt printers
 */
class ReceiptPrinterEncoder {
  #options = {};
  #queue = [];

  #language;
  #composer;

  #printerCapabilities = {
    'fonts': {
      'A': { size: '12x24', columns: 42 },
      'B': { size: '9x24', columns: 56 },
    },
    'barcodes': {
      'supported': true,
      'symbologies': [
        'upca', 'upce', 'ean13', 'ean8', 'code39', 'itf', 'codabar', 'code93',
        'code128', 'gs1-databar-omni', 'gs1-databar-truncated',
        'gs1-databar-limited', 'gs1-databar-expanded',
      ],
    },
    'qrcode': {
      'supported': true,
      'models': ['1', '2'],
    },
    'pdf417': {
      'supported': true,
    },
  };

  #codepageMapping = {};
  #codepageCandidates = [];
  #codepage = 'cp437';

  #state = {
    'codepage': 0,
    'font': 'A',
  };


  /**
     * Create a new object
     *
     * @param  {object}   options   Object containing configuration options
    */
  constructor(options) {
    options = options || {};

    const defaults = {
      columns: 42,
      language: 'esc-pos',
      imageMode: 'column',
      feedBeforeCut: 0,
      newline: '\n\r',
      codepageMapping: 'epson',
      codepageCandidates: null,
      errors: 'relaxed',
    };

    /* Determine default settings based on the printer language */

    if (typeof options.language === 'string') {
      defaults.columns = options.language === 'esc-pos' ? 42 : 48;
      defaults.codepageMapping = options.language === 'esc-pos' ? 'epson' : 'star';
    }

    /* Determine default settings based on the printer model */

    if (typeof options.printerModel === 'string') {
      if (typeof printerDefinitions[options.printerModel] === 'undefined') {
        throw new Error('Unknown printer model');
      }

      this.#printerCapabilities = printerDefinitions[options.printerModel].capabilities;

      /* Apply the printer definition to the defaults */

      defaults.columns = this.#printerCapabilities.fonts['A'].columns;
      defaults.language = this.#printerCapabilities.language;
      defaults.codepageMapping = this.#printerCapabilities.codepages;
      defaults.newline = this.#printerCapabilities?.newline || defaults.newline;
      defaults.feedBeforeCut = this.#printerCapabilities?.cutter?.feed || defaults.feedBeforeCut;
      defaults.imageMode = this.#printerCapabilities?.images?.mode || defaults.imageMode;
    }

    /* Merge options */

    if (options) {
      this.#options = Object.assign(defaults, {
        debug: false,
        embedded: false,
        createCanvas: null,
      }, options);
    }

    /* Backwards compatibility for the width option */

    if (this.#options.width) {
      this.#options.columns = this.#options.width;
    }

    /* Get the printer language */

    if (this.#options.language === 'esc-pos') {
      this.#language = new LanguageEscPos();
    } else if (this.#options.language === 'star-prnt' || this.#options.language === 'star-line') {
      this.#language = new LanguageStarPrnt();
    } else {
      throw new Error('The specified language is not supported');
    }

    /* Determine autoflush settings */
    /*

        StarPRNT printers are set up to have print start control set to page units.
        That means the printer will only print after it has received a cut or ff command.
        This is not ideal, so we set autoFlush to true by default, which will force
        the printer to print after each encode().

        One problem, we do not want to do this for embedded content. Only the top level
        encoder should flush the buffer.

        ESC/POS and Star Line Mode printers are set up to have print start control set to
        line units, which means the printer will print after each line feed command.
        We do not need to flush the buffer for these printers.

    */

    if (typeof this.#options.autoFlush === 'undefined') {
      this.#options.autoFlush = !this.#options.embedded && this.#options.language == 'star-prnt';
    }

    /* Check column width */

    if (![32, 35, 42, 44, 48].includes(this.#options.columns) && !this.#options.embedded) {
      throw new Error('The width of the paper must me either 32, 35, 42, 44 or 48 columns');
    }

    /* Determine codepage mapping and candidates */

    if (typeof this.#options.codepageMapping === 'string') {
      if (typeof codepageMappings[this.#options.language][this.#options.codepageMapping] === 'undefined') {
        throw new Error('Unknown codepage mapping');
      }

      this.#codepageMapping = Object.fromEntries(codepageMappings[this.#options.language][this.#options.codepageMapping]
        .map((v, i) => [v, i])
        .filter((i) => i));
    } else {
      this.#codepageMapping = this.#options.codepageMapping;
    }

    if (this.#options.codepageCandidates) {
      this.#codepageCandidates = this.#options.codepageCandidates;
    } else {
      this.#codepageCandidates = Object.keys(this.#codepageMapping);
    }

    /* Create our line composer */

    this.#composer = new LineComposer({
      embedded: this.#options.embedded,
      columns: this.#options.columns,
      align: 'left',
      size: 1,

      callback: (value) => this.#queue.push(value),
    });

    this.#reset();
  }

  /**
    * Reset the state of the object
    */
  #reset() {
    this.#queue = [];
    this.#codepage = this.#options.language == 'esc-pos' ? 'cp437' : 'star/standard';
    this.#state.codepage = -1;
    this.#state.font = 'A';
  }

  /**
     * Initialize the printer
     *
     * @return {object}          Return the object, for easy chaining commands
     *
     */
  initialize() {
    if (this.#options.embedded) {
      throw new Error('Initialize is not supported in table cells or boxes');
    }

    this.#composer.add(
      this.#language.initialize(),
    );

    return this;
  }

  /**
     * Change the code page
     *
     * @param  {string}   codepage  The codepage that we set the printer to
     * @return {object}             Return the object, for easy chaining commands
     *
     */
  codepage(codepage) {
    if (codepage === 'auto') {
      this.#codepage = codepage;
      return this;
    }

    if (!CodepageEncoder.supports(codepage)) {
      throw new Error('Unknown codepage');
    }

    if (typeof this.#codepageMapping[codepage] !== 'undefined') {
      this.#codepage = codepage;
    } else {
      throw new Error('Codepage not supported by printer');
    }

    return this;
  }

  /**
     * Print text
     *
     * @param  {string}   value  Text that needs to be printed
     * @return {object}          Return the object, for easy chaining commands
     *
     */
  text(value) {
    this.#composer.text(value, this.#codepage);

    return this;
  }

  /**
     * Print a newline
     *
     * @param  {string}   value  The number of newlines that need to be printed, defaults to 1
     * @return {object}          Return the object, for easy chaining commands
     *
     */
  newline(value) {
    value = parseInt(value, 10) || 1;

    for (let i = 0; i < value; i++) {
      this.#composer.flush({ forceNewline: true });
    }

    return this;
  }

  /**
     * Print text, followed by a newline
     *
     * @param  {string}   value  Text that needs to be printed
     * @return {object}          Return the object, for easy chaining commands
     *
     */
  line(value) {
    this.text(value);
    this.newline();

    return this;
  }

  /**
     * Underline text
     *
     * @param  {boolean|number}   value  true to turn on underline, false to turn off, or 2 for double underline
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  underline(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.underline = !this.#composer.style.underline;
    } else {
      this.#composer.style.underline = value;
    }

    return this;
  }

  /**
     * Italic text
     *
     * @param  {boolean}          value  true to turn on italic, false to turn off
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  italic(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.italic = !this.#composer.style.italic;
    } else {
      this.#composer.style.italic = value;
    }

    return this;
  }

  /**
     * Bold text
     *
     * @param  {boolean}          value  true to turn on bold, false to turn off
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  bold(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.bold = !this.#composer.style.bold;
    } else {
      this.#composer.style.bold = value;
    }

    return this;
  }

  /**
     * Invert text
     *
     * @param  {boolean}          value  true to turn on white text on black, false to turn off
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  invert(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.invert = !this.#composer.style.invert;
    } else {
      this.#composer.style.invert = value;
    }

    return this;
  }

  /**
     * Change width of text
     *
     * @param  {number}          width    The width of the text, 1 - 8
     * @return {object}                   Return the object, for easy chaining commands
     *
     */
  width(width) {
    if (typeof width === 'undefined') {
      width = 1;
    }

    if (typeof width !== 'number') {
      throw new Error('Width must be a number');
    }

    if (width < 1 || width > 8) {
      throw new Error('Width must be between 1 and 8');
    }

    this.#composer.style.width = width;

    return this;
  }

  /**
     * Change height of text
     *
     * @param  {number}          height  The height of the text, 1 - 8
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  height(height) {
    if (typeof height === 'undefined') {
      height = 1;
    }

    if (typeof height !== 'number') {
      throw new Error('Height must be a number');
    }

    if (height < 1 || height > 8) {
      throw new Error('Height must be between 1 and 8');
    }

    this.#composer.style.height = height;

    return this;
  }

  /**
     * Change text size
     *
     * @param  {Number|string}   width   The width of the text, 1 - 8
     * @param  {Number}          height  The height of the text, 1 - 8
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  size(width, height) {
    /* Backwards compatiblity for changing the font */
    if (typeof width === 'string') {
      return this.font(width === 'small' ? 'B' : 'A');
    }

    if (typeof height === 'undefined') {
      height = width;
    }

    this.width(width);
    this.height(height);

    return this;
  }

  /**
     * Choose different font
     *
     * @param  {string}          value   'A', 'B' or others
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  font(value) {
    if (this.#options.embedded) {
      throw new Error('Changing fonts is not supported in table cells or boxes');
    }

    if (this.#composer.cursor > 0) {
      throw new Error('Changing fonts is not supported in the middle of a line');
    }

    /* If size is specified, find the matching font */

    const matches = value.match(/^[0-9]+x[0-9]+$/);
    if (matches) {
      value = Object.entries(this.#printerCapabilities.fonts).find((i) => i[1].size == matches[0])[0];
    }

    /* Make sure the font name is uppercase */

    value = value.toUpperCase();

    /* Check if the font is supported */

    if (typeof this.#printerCapabilities.fonts[value] === 'undefined') {
      return this.#error('This font is not supported by this printer', 'relaxed');
    }

    /* Change the font */

    this.#composer.add(
      this.#language.font(value),
    );

    this.#state.font = value;

    /* Change the width of the composer */

    if (value === 'A') {
      this.#composer.columns = this.#options.columns;
    } else {
      this.#composer.columns =
        (this.#options.columns / this.#printerCapabilities.fonts['A'].columns) *
        this.#printerCapabilities.fonts[value].columns;
    }

    return this;
  }

  /**
     * Change text alignment
     *
     * @param  {string}          value   left, center or right
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  align(value) {
    const alignments = ['left', 'center', 'right'];

    if (!alignments.includes(value)) {
      throw new Error('Unknown alignment');
    }

    this.#composer.align = value;

    return this;
  }

  /**
     * Insert a table
     *
     * @param  {array}           columns  The column definitions
     * @param  {array}           data     Array containing rows. Each row is an array containing cells.
     *                                    Each cell can be a string value, or a callback function.
     *                                    The first parameter of the callback is the encoder object on
     *                                    which the function can call its methods.
     * @return {object}                   Return the object, for easy chaining commands
     *
     */
  table(columns, data) {
    this.#composer.flush();

    /* Process all lines */

    for (let r = 0; r < data.length; r++) {
      const lines = [];
      let maxLines = 0;

      /* Render all columns */

      for (let c = 0; c < columns.length; c++) {
        const columnEncoder = new ReceiptPrinterEncoder(Object.assign({}, this.#options, {
          width: columns[c].width,
          embedded: true,
        }));

        columnEncoder.codepage(this.#codepage);
        columnEncoder.align(columns[c].align);

        if (typeof data[r][c] === 'string') {
          columnEncoder.text(data[r][c]);
        }

        if (typeof data[r][c] === 'function') {
          data[r][c](columnEncoder);
        }

        const cell = columnEncoder.commands();

        /* Determine the height in lines of the row */

        maxLines = Math.max(maxLines, cell.length);

        lines[c] = cell;
      }

      /* Pad the cells in this line to the same height */

      for (let c = 0; c < columns.length; c++) {
        if (lines[c].length >= maxLines) {
          continue;
        }

        for (let p = lines[c].length; p < maxLines; p++) {
          let verticalAlign = 'top';
          if (typeof columns[c].verticalAlign !== 'undefined') {
            verticalAlign = columns[c].verticalAlign;
          }

          const line = { commands: [{ type: 'space', size: columns[c].width }], height: 1 };

          if (verticalAlign == 'bottom') {
            lines[c].unshift(line);
          } else {
            lines[c].push(line);
          }
        }
      }

      /* Add the lines to the composer */

      for (let l = 0; l < maxLines; l++) {
        for (let c = 0; c < columns.length; c++) {
          if (typeof columns[c].marginLeft !== 'undefined') {
            this.#composer.space(columns[c].marginLeft);
          }

          this.#composer.add(lines[c][l].commands, columns[c].width);

          if (typeof columns[c].marginRight !== 'undefined') {
            this.#composer.space(columns[c].marginRight);
          }
        }

        this.#composer.flush();
      }
    }

    return this;
  }

  /**
     * Insert a horizontal rule
     *
     * @param  {object}          options  And object with the following properties:
     *                                    - style: The style of the line, either single or double
     *                                    - width: The width of the line, by default the width of the paper
     * @return {object}                   Return the object, for easy chaining commands
     *
     */
  rule(options) {
    options = Object.assign({
      style: 'single',
      width: this.#options.columns || 10,
    }, options || {});

    this.#composer.flush();

    this.#composer.text((options.style === 'double' ? '═' : '─').repeat(options.width), 'cp437');
    this.#composer.flush({ forceNewline: true });

    return this;
  }

  /**
     * Insert a box
     *
     * @param  {object}           options   And object with the following properties:
     *                                      - style: The style of the border, either single or double
     *                                      - width: The width of the box, by default the width of the paper
     *                                      - marginLeft: Space between the left border and the left edge
     *                                      - marginRight: Space between the right border and the right edge
     *                                      - paddingLeft: Space between the contents and the left border of the box
     *                                      - paddingRight: Space between the contents and the right border of the box
     * @param  {string|function}  contents  A string value, or a callback function.
     *                                      The first parameter of the callback is the encoder object on
     *                                      which the function can call its methods.
     * @return {object}                     Return the object, for easy chaining commands
     *
     */
  box(options, contents) {
    options = Object.assign({
      style: 'single',
      width: this.#options.columns,
      marginLeft: 0,
      marginRight: 0,
      paddingLeft: 0,
      paddingRight: 0,
    }, options || {});

    if (options.width + options.marginLeft + options.marginRight > this.#options.columns) {
      throw new Error('Box is too wide');
    }

    let elements;

    if (options.style == 'single') {
      elements = ['┌', '┐', '└', '┘', '─', '│'];
    } else if (options.style == 'double') {
      elements = ['╔', '╗', '╚', '╝', '═', '║'];
    }

    /* Render the contents of the box */

    const columnEncoder = new ReceiptPrinterEncoder(Object.assign({}, this.#options, {
      width: options.width - (options.style == 'none' ? 0 : 2) - options.paddingLeft - options.paddingRight,
      embedded: true,
    }));

    columnEncoder.codepage(this.#codepage);
    columnEncoder.align(options.align);

    if (typeof contents === 'function') {
      contents(columnEncoder);
    }

    if (typeof contents === 'string') {
      columnEncoder.text(contents);
    }

    const lines = columnEncoder.commands();

    /* Header */

    this.#composer.flush();

    if (options.style != 'none') {
      this.#composer.space(options.marginLeft);
      this.#composer.text(elements[0], 'cp437');
      this.#composer.text(elements[4].repeat(options.width - 2), 'cp437');
      this.#composer.text(elements[1], 'cp437');
      this.#composer.space(options.marginRight);
      this.#composer.flush();
    }

    /* Content */

    for (let i = 0; i < lines.length; i++) {
      this.#composer.space(options.marginLeft);

      if (options.style != 'none') {
        this.#composer.style.height = lines[i].height;
        this.#composer.text(elements[5], 'cp437');
        this.#composer.style.height = 1;
      }

      this.#composer.space(options.paddingLeft);
      this.#composer.add(lines[i].commands,
        options.width - (options.style == 'none' ? 0 : 2) - options.paddingLeft - options.paddingRight);
      this.#composer.space(options.paddingRight);

      if (options.style != 'none') {
        this.#composer.style.height = lines[i].height;
        this.#composer.text(elements[5], 'cp437');
        this.#composer.style.height = 1;
      }

      this.#composer.space(options.marginRight);
      this.#composer.flush();
    }

    /* Footer */

    if (options.style != 'none') {
      this.#composer.space(options.marginLeft);
      this.#composer.text(elements[2], 'cp437');
      this.#composer.text(elements[4].repeat(options.width - 2), 'cp437');
      this.#composer.text(elements[3], 'cp437');
      this.#composer.space(options.marginRight);
      this.#composer.flush();
    }

    return this;
  }

  /**
     * Barcode
     *
     * @param  {string}           value  the value of the barcode
     * @param  {string|number}    symbology  the type of the barcode
     * @param  {number|object}    height  Either the configuration object, or backwards compatible height of the barcode
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  barcode(value, symbology, height) {
    let options = {
      height: 60,
      width: 2,
      text: false,
    };

    if (typeof height === 'object') {
      options = Object.assign(options, height);
    }

    if (typeof height === 'number') {
      options.height = height;
    }

    if (this.#options.embedded) {
      throw new Error('Barcodes are not supported in table cells or boxes');
    }

    if (this.#printerCapabilities.barcodes.supported === false) {
      return this.#error('Barcodes are not supported by this printer', 'relaxed');
    }

    if (typeof symbology === 'string' && !this.#printerCapabilities.barcodes.symbologies.includes(symbology)) {
      return this.#error(`Symbology '${symbology}' not supported by this printer`, 'relaxed');
    }

    /* Force printing the print buffer and moving to a new line */

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* Barcode */

    this.#composer.add(
      this.#language.barcode(value, symbology, options),
    );

    /* Reset alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    return this;
  }

  /**
     * QR code
     *
     * @param  {string}           value       The value of the qr code
     * @param  {number|object}    model       Either the configuration object, or
     *                                        backwards compatible model of the qrcode, either 1 or 2
     * @param  {number}           size        Backwards compatible size of the qrcode, a value between 1 and 8
     * @param  {string}           errorlevel  Backwards compatible the amount of error correction used,
     *                                        either 'l', 'm', 'q', 'h'
     * @return {object}                       Return the object, for easy chaining commands
     */
  qrcode(value, model, size, errorlevel) {
    let options = {
      model: 2,
      size: 6,
      errorlevel: 'm',
    };

    if (typeof model === 'object') {
      options = Object.assign(options, model);
    }

    if (typeof model === 'number') {
      options.model = model;
    }

    if (typeof size === 'number') {
      options.size = size;
    }

    if (typeof errorlevel === 'string') {
      options.errorlevel = errorlevel;
    }

    if (this.#options.embedded) {
      throw new Error('QR codes are not supported in table cells or boxes');
    }

    if (this.#printerCapabilities.qrcode.supported === false) {
      return this.#error('QR codes are not supported by this printer', 'relaxed');
    }

    if (options.model && !this.#printerCapabilities.qrcode.models.includes(String(options.model))) {
      return this.#error('QR code model is not supported by this printer', 'relaxed');
    }

    /* Force printing the print buffer and moving to a new line */

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* QR code */

    this.#composer.add(
      this.#language.qrcode(value, options),
    );

    /* Reset alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    return this;
  }


  /**
     * PDF417 code
     *
     * @param  {string}           value     The value of the qr code
     * @param  {object}           options   Configuration object
     * @return {object}                     Return the object, for easy chaining commands
     *
     */
  pdf417(value, options) {
    options = Object.assign({
      width: 3,
      height: 3,
      columns: 0,
      rows: 0,
      errorlevel: 1,
      truncated: false,
    }, options || {});

    if (this.#options.embedded) {
      throw new Error('PDF417 codes are not supported in table cells or boxes');
    }

    if (this.#printerCapabilities.pdf417.supported === false) {
      /* If possible, fallback to a barcode with symbology */

      if (typeof this.#printerCapabilities.pdf417.fallback === 'object') {
        return this.barcode(value, this.#printerCapabilities.pdf417.fallback.symbology);
      }

      return this.#error('PDF417 codes are not supported by this printer', 'relaxed');
    }

    /* Force printing the print buffer and moving to a new line */

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* PDF417 code */

    this.#composer.add(
      this.#language.pdf417(value, options),
    );

    /* Reset alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    return this;
  }


  /**
     * Image
     *
     * @param  {object}         input  an element, like a canvas or image that needs to be printed
     * @param  {number}         width  width of the image on the printer
     * @param  {number}         height  height of the image on the printer
     * @return {Promise<object>}        Return a Promise that resolves to the object, for easy chaining commands
     *
     */
  async image(input, width, height) {
    if (this.#options.embedded) {
      throw new Error('Images are not supported in table cells or boxes');
    }

    // Validate input has required properties
    if (!input || !input.data || typeof input.width !== 'number' || typeof input.height !== 'number') {
      throw new Error('Invalid image input: must have data, width, and height properties');
    }

    // Use input directly instead of copying to reduce memory usage
    // The ImageEncoder will handle the data immutably
    const image = {
      data: input.data, // Direct reference, no copy
      height: input.height,
      width: input.width,
      colorSpace: input.colorSpace,
      pixelFormat: input.pixelFormat,
    };

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* Determine if compression should be used based on printer capabilities */
    const supportsCompression = this.#printerCapabilities?.images?.supportsCompression ?? false;

    /* Encode the image data */
    const imageResult = this.#language.image(
      image,
      width,
      height,
      this.#options.imageMode,
      { supportsCompression },
    );

    // Wait for the result if it's a Promise (async processing for large images)
    const encodedImage = await Promise.resolve(imageResult);

    this.#composer.add(encodedImage);

    /* Reset alignment */
    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    return this;
  }

  /**
     * Cut paper
     *
     * @param  {string}          value   full or partial. When not specified a full cut will be assumed
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  cut(value) {
    if (this.#options.embedded) {
      throw new Error('Cut is not supported in table cells or boxes');
    }

    for (let i = 0; i < this.#options.feedBeforeCut; i++) {
      this.#composer.flush({ forceNewline: true });
    }

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    this.#composer.add(
      this.#language.cut(value),
    );

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    return this;
  }

  /**
     * Pulse
     *
     * @param  {number}          device  0 or 1 for on which pin the device is connected, default of 0
     * @param  {number}          on      Time the pulse is on in milliseconds, default of 100
     * @param  {number}          off     Time the pulse is off in milliseconds, default of 500
     * @return {object}                  Return the object, for easy chaining commands
     *
     */
  pulse(device, on, off) {
    if (this.#options.embedded) {
      throw new Error('Pulse is not supported in table cells or boxes');
    }

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    this.#composer.add(
      this.#language.pulse(device, on, off),
    );

    this.#composer.flush({ forceFlush: true, ignoreAlignment: true });

    return this;
  }

  /**
     * Add raw printer commands
     *
     * @param  {array}           data   raw bytes to be included
     * @return {object}          Return the object, for easy chaining commands
     *
     */
  raw(data) {
    this.#composer.raw(data);

    return this;
  }

  /**
   * Internal function for encoding style changes
   * @param  {string}          property  The property that needs to be changed
   * @param  {boolean}         value     Is the property enabled or disabled
   * @return {array}                     Return the encoded bytes
   */
  #encodeStyle(property, value) {
    if (property === 'bold') {
      return this.#language.bold(value);
    }

    if (property === 'underline') {
      return this.#language.underline(value);
    }

    if (property === 'italic') {
      return this.#language.italic(value);
    }

    if (property === 'invert') {
      return this.#language.invert(value);
    }

    if (property === 'size') {
      return this.#language.size(value.width, value.height);
    }
  }

  /**
   * Internal function for encoding text in the correct codepage
   * @param  {string}          value  The text that needs to be encoded
   * @param  {string}          codepage  The codepage that needs to be used
   * @return {array}                   Return the encoded bytes
   */
  #encodeText(value, codepage) {
    if (codepage === null) {
      const fragment = CodepageEncoder.encode(value, 'ascii');

      return [
        { type: 'text', payload: [...fragment] },
      ];
    }

    if (codepage !== 'auto') {
      const fragment = CodepageEncoder.encode(value, codepage);

      if (this.#state.codepage != this.#codepageMapping[codepage]) {
        this.#state.codepage = this.#codepageMapping[codepage];

        return [
          { type: 'codepage', payload: this.#language.codepage(this.#codepageMapping[codepage]) },
          { type: 'text', payload: [...fragment] },
        ];
      }

      return [
        { type: 'text', payload: [...fragment] },
      ];
    }

    const fragments = CodepageEncoder.autoEncode(value, this.#codepageCandidates);
    const buffer = [];

    for (const fragment of fragments) {
      this.#state.codepage = this.#codepageMapping[fragment.codepage];
      buffer.push(
        { type: 'codepage', payload: this.#language.codepage(this.#codepageMapping[fragment.codepage]) },
        { type: 'text', payload: [...fragment.bytes] },
      );
    }

    return buffer;
  }

  /**
   * Get all the commands
   *
   * @return {array}         All the commands currently in the queue
   */
  commands() {
    let requiresFlush = true;

    /* Determine if the last command is a pulse or cut, the we do not need a flush */

    const lastLine = this.#queue[this.#queue.length - 1];

    if (lastLine) {
      const lastCommand = lastLine[lastLine.length - 1];

      if (lastCommand && ['pulse', 'cut'].includes(lastCommand.type)) {
        requiresFlush = false;
      }
    }

    /* Flush the printer line buffer if needed */

    if (requiresFlush && this.#options.autoFlush && !this.#options.embedded) {
      this.#composer.add(
        this.#language.flush(),
      );
    }

    /* Get the remaining from the composer */

    const result = [];

    const remaining = this.#composer.fetch({ forceFlush: true, ignoreAlignment: true });

    if (remaining.length) {
      this.#queue.push(remaining);
    }

    /* Process all lines in the queue */

    while (this.#queue.length) {
      const line = this.#queue.shift();
      const height = line
        .filter((i) => i.type === 'style' && i.property === 'size')
        .map((i) => i.value.height)
        .reduce((a, b) => Math.max(a, b), 1);

      if (this.#options.debug) {
        console.log('|' + line.filter((i) => i.type === 'text').map((i) => i.value).join('') + '|', height);
      }

      result.push({
        commands: line,
        height: height,
      });
    }

    if (this.#options.debug) {
      console.log('commands', result);
    }

    this.#reset();

    return result;
  }

  /**
     * Encode all previous commands
     *
     * @param  {string}          format  The format of the output, either 'commands',
     *                                   'lines' or 'array', defaults to 'array'
     * @return {Uint8Array}              Return the encoded bytes in the format specified
     */
  encode(format) {
    /* Get the commands */

    const commands = this.commands();

    if (format === 'commands') {
      return commands;
    }

    /* Build the lines */

    const lines = [];

    for (const line of commands) {
      const buffer = [];

      for (const item of line.commands) {
        if (item.type === 'text') {
          buffer.push(...this.#encodeText(item.value, item.codepage));
        } else if (item.type === 'style') {
          buffer.push(Object.assign(item, { payload: this.#encodeStyle(item.property, item.value) }));
        } else if (item.value || item.payload) {
          buffer.push(item);
        }
      }

      lines.push(buffer);
    }

    if (format === 'lines') {
      return lines;
    }

    /* Build the array */

    // Calculate total size first to avoid reallocation
    let totalSize = 0;
    let last = null;
    const newlineBytes = this.#options.newline === '\n\r' ? 2 : (this.#options.newline === '\n' ? 1 : 0);

    for (const line of lines) {
      for (const item of line) {
        if (item.payload) {
          // Handle both Array and Uint8Array payloads
          totalSize += item.payload.length;
        }
        last = item;
      }
      totalSize += newlineBytes;
    }

    // Allocate result buffer
    const result = new Uint8Array(totalSize);
    let offset = 0;

    for (const line of lines) {
      for (const item of line) {
        if (item.payload) {
          // Handle both Array and Uint8Array payloads efficiently
          if (item.payload instanceof Uint8Array) {
            result.set(item.payload, offset);
            offset += item.payload.length;
          } else {
            // It's a regular array
            for (let i = 0; i < item.payload.length; i++) {
              result[offset++] = item.payload[i];
            }
          }
        }
        last = item;
      }

      if (this.#options.newline === '\n\r') {
        result[offset++] = 0x0a;
        result[offset++] = 0x0d;
      } else if (this.#options.newline === '\n') {
        result[offset++] = 0x0a;
      }
    }

    /* If the last command is a pulse, do not feed */

    if (last && last.type === 'pulse') {
      return result.subarray(0, offset - newlineBytes);
    }

    return result.subarray(0, offset);
  }

  /**
   * Encode all previous commands and return an async iterator for streaming transmission
   * This method enables backpressure-aware transmission to printers with limited buffers.
   *
   * @param {Object} [options] - Streaming options
   * @param {number} [options.chunkSize=512] - Size of each chunk in bytes (default optimized for printer buffers)
   * @param {Function} [options.onChunkSent] - Callback invoked after each chunk is yielded.
   *   Receives: { index: number, total: number, bytes: number, bytesSent: number, totalBytes: number }
   *   Return a Promise to implement backpressure (e.g., wait for printer acknowledgment)
   * @yields {Uint8Array} Chunks of encoded data for transmission
   * @example
   * // Basic usage with backpressure
   * for await (const chunk of encoder.encodeAsyncIterator({
   *   chunkSize: 256,
   *   onChunkSent: async (info) => {
   *     console.log(`Sent chunk ${info.index + 1}/${info.total}`);
   *     await sendToPort(chunk);
   *     await delay(10); // Give printer time to process
   *   }
   * })) {
   *   await sendToPort(chunk);
   * }
   */
  async* encodeAsyncIterator(options = {}) {
    const { chunkSize = ImageEncoder.DEFAULT_CHUNK_SIZE, onChunkSent } = options;

    // Get the complete encoded data
    const fullData = this.encode();

    if (fullData.length === 0) {
      return;
    }

    // Use ImageEncoder's chunking infrastructure for consistency
    const chunksGenerator = ImageEncoder.generateChunks(fullData, chunkSize);

    for (const chunkInfo of chunksGenerator) {
      // Yield the chunk
      yield chunkInfo.chunk;

      // Call callback if provided (enables backpressure)
      if (onChunkSent) {
        const callbackInfo = {
          index: chunkInfo.index,
          total: chunkInfo.total,
          bytes: chunkInfo.chunk.length,
          bytesSent: chunkInfo.byteOffset + chunkInfo.chunk.length,
          totalBytes: chunkInfo.totalBytes,
          isLast: chunkInfo.isLast,
        };

        // Await the callback to enable backpressure
        await Promise.resolve(onChunkSent(callbackInfo));
      }
    }
  }

  /**
   * Throw an error
   *
   * @param  {string}          message  The error message
   * @param  {string}          level    The error level, if level is strict,
   *                                    an error will be thrown, if level is relaxed,
   *                                    a warning will be logged
   * @return {object}          Return the object, for easy chaining commands
   */
  #error(message, level) {
    if (level === 'strict' || this.#options.errors === 'strict') {
      throw new Error(message);
    }

    console.warn(message);

    return this;
  }

  /**
   * Get all supported printer models
   *
   * @return {object}         An object with all supported printer models
   */
  static get printerModels() {
    return Object.entries(printerDefinitions).map((i) => ({ id: i[0], name: i[1].vendor + ' ' + i[1].model }));
  }

  /**
   * Get the current column width
   *
   * @return {number}         The column width in characters
   */
  get columns() {
    return this.#composer.columns;
  }

  /**
   * Get the current language
   * @return {string}         The language that is currently used
   */
  get language() {
    return this.#options.language;
  }

  /**
   * Get the capabilities of the printer
   * @return {object}         The capabilities of the printer
   */
  get printerCapabilities() {
    return this.#printerCapabilities;
  }
}

export { ReceiptPrinterEncoder as default };
