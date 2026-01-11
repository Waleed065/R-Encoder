# Receipt Printer Encoder

Version: 1.0.0

Enterprise-grade library for generating ESC/POS, StarLine, and StarPRNT command streams for thermal receipt printers. Features memory-efficient image processing, RLE compression, and streaming transmission for large payloads.

## Features

- ✅ **Multi-protocol support**: ESC/POS, StarLine, StarPRNT
- ✅ **33 built-in printer definitions** with automatic capability detection
- ✅ **Memory-efficient image processing** - no stack overflow on large images
- ✅ **Strip-based raster encoding** - automatically splits large images into 256px-height strips to prevent memory overflow
- ✅ **RLE compression** for supported printers (40-98% size reduction)
- ✅ **Streaming transmission** with backpressure support
- ✅ **TypeScript definitions** included
- ✅ **Works with**: React Native, React Native Windows, Node.js, Browser

## Installation

```bash
npm install @point-of-sale/receipt-printer-encoder
```

## Quick Start

```javascript
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

const encoder = new ReceiptPrinterEncoder({
  printerModel: 'epson-tm-t88vi',
});

encoder
  .initialize()
  .line('Hello World!')
  .newline()
  .line('Receipt printed successfully')
  .cut();

const data = encoder.encode();
// Send `data` (Uint8Array) to your printer via TCP/USB/Bluetooth
```

---

## Examples

### 1. Normal Receipt (Text-based)

A typical POS receipt with formatting, tables, and barcodes:

```javascript
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

async function printNormalReceipt(printerService) {
  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
    columns: 42,
  });

  encoder
    .initialize()

    // Header
    .align('center')
    .bold(true)
    .size(2, 2)
    .line('MY STORE')
    .size(1, 1)
    .bold(false)
    .line('123 Main Street')
    .line('City, State 12345')
    .line('Tel: (555) 123-4567')
    .newline()

    // Receipt info
    .align('left')
    .line('================================')
    .line(`Date: ${new Date().toLocaleDateString()}`)
    .line(`Time: ${new Date().toLocaleTimeString()}`)
    .line(`Receipt #: INV-2026-001234`)
    .line('================================')
    .newline()

    // Items table
    .table(
      [
        {width: 20, align: 'left'},
        {width: 8, align: 'right'},
        {width: 10, align: 'right'},
      ],
      [
        ['Item', 'Qty', 'Price'],
        ['--------------------------------', '', ''],
        ['Coffee Latte', '2', '$8.50'],
        ['Croissant', '1', '$3.25'],
        ['Orange Juice', '2', '$6.00'],
        ['Sandwich', '1', '$7.50'],
        ['--------------------------------', '', ''],
      ],
    )

    // Totals
    .newline()
    .table(
      [
        {width: 22, align: 'left'},
        {width: 16, align: 'right'},
      ],
      [
        ['Subtotal:', '$25.25'],
        ['Tax (8%):', '$2.02'],
        ['', '--------'],
      ],
    )
    .bold(true)
    .table(
      [
        {width: 22, align: 'left'},
        {width: 16, align: 'right'},
      ],
      [['TOTAL:', '$27.27']],
    )
    .bold(false)
    .newline()

    // Payment
    .line('Payment: VISA ****4242')
    .newline()

    // Barcode
    .align('center')
    .barcode('INV2026001234', 'code128', {
      height: 60,
      text: true,
    })
    .newline()

    // Footer
    .line('Thank you for your purchase!')
    .line('Please come again')
    .newline()
    .newline()

    // Cut paper
    .cut();

  // Send to printer
  const data = encoder.encode();
  await printerService.print(data);
}
```

---

### 2. Raster Receipt (Image-based)

For receipts that need custom fonts, complex layouts, or graphics, render the entire receipt as an image:

**Technical: Strip-Based Raster Encoding**

Large raster images are automatically split into 256-pixel-height strips to prevent memory overflow. Each strip generates a separate ESC/POS GS v 0 command, which the printer concatenates seamlessly as continuous output. This architecture prevents single large buffer allocations while maintaining print quality.

**Binary GS v 0 Command Structure:**

- `0x1D 0x76 0x30` - GS v 0 command header
- `m` (1 byte) - Mode (0x00 = uncompressed, 0x01 = RLE compressed)
- `xL xH` (2 bytes) - Width in bytes (little-endian), each strip uses same width as full image
- `yL yH` (2 bytes) - Height in pixels (little-endian), typically 256 for all strips except last
- `[raster data]` - 1-bit monochrome bitmap (MSB first, row-major)

**Example for 500px tall × 576px wide image:**

- Strip 1: 256 rows → GS v 0 header + width (72 bytes) + height (256) + 18,432 bytes raster data
- Strip 2: 244 rows → GS v 0 header + width (72 bytes) + height (244) + 17,568 bytes raster data
- Memory pool: 4MB max, prevents allocation failures

```javascript
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

/**
 * Print a full raster receipt (entire receipt is an image)
 * Useful for custom fonts, complex layouts, or branded designs
 * Automatically handles large images via strip-based encoding (256px height default)
 */
async function printRasterReceipt(printerService, receiptImageData) {
  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
    imageMode: 'raster', // Use raster mode for full-page images
  });

  // receiptImageData should be an ImageData object with:
  // - data: Uint8ClampedArray (RGBA pixels)
  // - width: number (must be multiple of 8, typically 384 or 576)
  // - height: number (can be unlimited; library auto-splits into 256px strips)

  encoder.initialize();

  // Print the raster receipt - library handles large images via strip-based encoding
  await encoder.image(
    receiptImageData,
    receiptImageData.width,
    receiptImageData.height,
  );

  encoder.newline().cut();

  const data = encoder.encode();
  await printerService.print(data);
}

/**
 * Example: Create receipt image from HTML/Canvas (React Native)
 */
async function createReceiptImage(htmlContent) {
  // Option 1: Use react-native-view-shot to capture a View
  // Option 2: Use a headless canvas library
  // Option 3: Generate on server and send image data

  // The image should be:
  // - Width: 384px (58mm paper) or 576px (80mm paper) at 203 DPI
  // - Monochrome or grayscale (library converts to 1-bit)
  // - PNG or raw ImageData format

  return {
    data: new Uint8ClampedArray(/* RGBA pixel data */),
    width: 384, // Must be multiple of 8
    height: 800, // Variable based on content
  };
}
```

**Recommended image dimensions:**

| Paper Width | DPI | Pixel Width | Max Height |
| ----------- | --- | ----------- | ---------- |
| 58mm        | 203 | 384px       | Unlimited  |
| 80mm        | 203 | 576px       | Unlimited  |
| 80mm        | 180 | 512px       | Unlimited  |

**Height is unlimited**: Images are automatically split into 256-pixel-height strips. For example, a 2000px tall image is divided into 8 strips (7 × 256px + 1 × 48px). The library maintains a 4MB memory pool per strip to prevent allocation failures. Memory-efficient processing prevents main thread blocking during large image encoding.

---

### 3. Image Printing (Logos & Graphics)

Print logos, signatures, or graphics within a text receipt:

```javascript
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

/**
 * Print receipt with embedded logo
 */
async function printReceiptWithLogo(printerService, logoImageData) {
  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
  });

  encoder.initialize();

  // Center and print logo
  encoder.align('center');

  // Logo should be appropriately sized (e.g., 200x80 pixels)
  await encoder.image(logoImageData, logoImageData.width, logoImageData.height);

  encoder
    .newline()
    .bold(true)
    .size(2, 2)
    .line('RECEIPT')
    .size(1, 1)
    .bold(false)
    .newline()
    .align('left')
    .line('Order #12345')
    .line(`Date: ${new Date().toLocaleDateString()}`)
    .newline()
    // ... rest of receipt
    .cut();

  const data = encoder.encode();
  await printerService.print(data);
}

/**
 * Print signature capture
 */
async function printWithSignature(printerService, signatureImageData) {
  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
  });

  encoder.initialize().line('Customer Signature:').newline();

  // Print signature (typically 300x100 pixels)
  await encoder.image(
    signatureImageData,
    signatureImageData.width,
    signatureImageData.height,
  );

  encoder
    .newline()
    .line('_'.repeat(30))
    .line('I agree to the terms above')
    .newline()
    .cut();

  const data = encoder.encode();
  await printerService.print(data);
}
```

---

### 4. Large Image Printing (Streaming with Backpressure)

For large images or full raster receipts, use streaming to prevent printer buffer overflow. **Technical: Strip-Level Backpressure**

Images are processed using strip-based encoding: each 256-pixel-height strip generates a separate GS v 0 command. Backpressure control operates at the **strip level**, not the monolithic image level. The encoder yields control after every 4 strips to prevent UI blocking. Memory pool (4MB max) ensures consistent performance regardless of image height.

```javascript
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

/**
 * Print large image with streaming and backpressure control
 * This prevents printer buffer overflow and app crashes
 * Backpressure operates at 256px strip boundaries
 */
async function printLargeImage(printerService, largeImageData) {
  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
    imageMode: 'raster',
  });

  encoder.initialize();

  // Add the large image - processed memory-efficiently via strip-based encoding
  // For example, a 2000px tall image becomes 8 strips (7×256px + 1×48px)
  // Each strip generates a separate GS v 0 command
  await encoder.image(
    largeImageData,
    largeImageData.width,
    largeImageData.height,
  );

  encoder.cut();

  // Use streaming transmission with backpressure
  let totalBytesSent = 0;
  let stripCount = 0;

  for await (const chunk of encoder.encodeAsyncIterator({
    chunkSize: 512, // 512 bytes per chunk (optimal for most printers)

    onChunkSent: async info => {
      console.log(
        `Progress: ${info.index + 1}/${info.total} chunks (${Math.round(
          (info.bytesSent / info.totalBytes) * 100,
        )}%)`,
      );

      // Track which strip we're in (each strip ≈ 18-20KB for 576px width)
      const estimatedStripIndex = Math.floor(info.bytesSent / 20480);
      if (estimatedStripIndex > stripCount) {
        stripCount = estimatedStripIndex;
        console.log(`  Strip ${stripCount}: Async yield executed, resuming...`);
      }

      // Optional: Add delay between chunks to prevent buffer overflow
      // Adjust based on printer speed and connection quality
      if (!info.isLast) {
        await delay(5); // 5ms delay between chunks
      }
    },
  })) {
    // Send chunk to printer
    await printerService.sendChunk(chunk);
    totalBytesSent += chunk.length;
  }

  console.log(
    `Print complete: ${totalBytesSent} bytes sent across ${stripCount} strips`,
  );
}

// Helper function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Complete working example showing internals:
 * - Image encoding with strip-based architecture
 * - Async/await with yield control after every 4 strips
 * - Memory pool management (4MB max per strip)
 */
async function printWithStripTracking(printerService, imageData) {
  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
    imageMode: 'raster',
  });

  encoder.initialize();

  // Image 1000px tall × 576px wide example:
  // - Strip count: Math.ceil(1000 / 256) = 4 strips
  // - Each strip width: 576 / 8 = 72 bytes
  // - Strip 1-3: 256 rows × 72 bytes = 18,432 bytes each
  // - Strip 4: 232 rows × 72 bytes = 16,704 bytes
  // - Total: ~73,572 bytes (easily fits in 4MB pool)
  //
  // GS v 0 command per strip:
  // [0x1D 0x76 0x30] [mode:1] [xL:72 xH:0] [yL:256 yH:0] [18432 bytes raster data]
  //
  // Async execution: yield after strip 0, 4 (if exists)
  // - Strip 0 processed: await new Promise(resolve => setTimeout(resolve, 0));
  // - Strip 1 processed: no yield (i=1, 1%4=1)
  // - Strip 2 processed: no yield (i=2, 2%4=2)
  // - Strip 3 processed: no yield (i=3, 3%4=3)
  // - Strip 4 processed: yield (i=4, 4%4=0 && i>0)

  console.log('Encoding image with strip-based architecture...');
  const startTime = Date.now();

  await encoder.image(imageData, imageData.width, imageData.height);
  encoder.cut();

  console.log(`Image encoding complete in ${Date.now() - startTime}ms`);
  console.log('Streaming to printer...');

  let chunkCount = 0;
  for await (const chunk of encoder.encodeAsyncIterator({chunkSize: 512})) {
    await printerService.sendChunk(chunk);
    chunkCount++;
  }

  console.log(`Sent ${chunkCount} chunks to printer`);
}

/**
 * Print large image with streaming and backpressure control
 * This prevents printer buffer overflow and app crashes
 */
async function printLargeImage(printerService, largeImageData) {
  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
    imageMode: 'raster',
  });

  encoder.initialize();

  // Add the large image (this is processed memory-efficiently)
  await encoder.image(
    largeImageData,
    largeImageData.width,
    largeImageData.height,
  );

  encoder.cut();

  // Use streaming transmission with backpressure
  let totalBytesSent = 0;

  for await (const chunk of encoder.encodeAsyncIterator({
    chunkSize: 512, // 512 bytes per chunk (optimal for most printers)

    onChunkSent: async info => {
      console.log(
        `Progress: ${info.index + 1}/${info.total} chunks (${Math.round(
          (info.bytesSent / info.totalBytes) * 100,
        )}%)`,
      );

      // Optional: Add delay between chunks to prevent buffer overflow
      // Adjust based on printer speed and connection quality
      if (!info.isLast) {
        await delay(5); // 5ms delay between chunks
      }
    },
  })) {
    // Send chunk to printer
    await printerService.sendChunk(chunk);
    totalBytesSent += chunk.length;
  }

  console.log(`Print complete: ${totalBytesSent} bytes sent`);
}

// Helper function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Advanced: With retry logic and error handling:**

```javascript
/**
 * Enterprise-grade large image printing with retry logic
 */
async function printLargeImageWithRetry(
  printerService,
  imageData,
  options = {},
) {
  const {
    maxRetries = 3,
    chunkSize = 512,
    chunkDelay = 5,
    timeout = 30000,
  } = options;

  const encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
    imageMode: 'raster',
  });

  encoder.initialize();
  await encoder.image(imageData, imageData.width, imageData.height);
  encoder.cut();

  const startTime = Date.now();
  let currentChunkIndex = 0;

  for await (const chunk of encoder.encodeAsyncIterator({chunkSize})) {
    // Timeout check
    if (Date.now() - startTime > timeout) {
      throw new Error('Print timeout exceeded');
    }

    // Retry logic for each chunk
    let retries = 0;
    let success = false;

    while (!success && retries < maxRetries) {
      try {
        await printerService.sendChunk(chunk);
        success = true;
      } catch (error) {
        retries++;
        console.warn(
          `Chunk ${currentChunkIndex} failed, retry ${retries}/${maxRetries}`,
        );

        if (retries >= maxRetries) {
          throw new Error(
            `Failed to send chunk ${currentChunkIndex} after ${maxRetries} retries: ${error.message}`,
          );
        }

        // Wait before retry (exponential backoff)
        await delay(100 * Math.pow(2, retries));
      }
    }

    // Delay between chunks
    await delay(chunkDelay);
    currentChunkIndex++;
  }

  return {success: true, chunks: currentChunkIndex};
}
```

---

## Platform Integration

### React Native (Android/iOS) - `react-native-tcp-socket`

```javascript
import TcpSocket from 'react-native-tcp-socket';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

class TcpPrinterService {
  constructor(host, port = 9100) {
    this.host = host;
    this.port = port;
    this.socket = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = TcpSocket.createConnection(
        {host: this.host, port: this.port},
        () => {
          console.log(`Connected to printer at ${this.host}:${this.port}`);
          resolve();
        },
      );

      this.socket.on('error', error => {
        console.error('Printer connection error:', error);
        reject(error);
      });

      this.socket.on('close', () => {
        console.log('Printer connection closed');
        this.socket = null;
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.socket) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  async sendChunk(data) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      // Convert Uint8Array to Buffer for react-native-tcp-socket
      const buffer = Buffer.from(data);

      this.socket.write(buffer, 'binary', error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async print(data) {
    // For small payloads, send all at once
    await this.sendChunk(data);
  }

  async printLargeImage(imageData) {
    const encoder = new ReceiptPrinterEncoder({
      printerModel: 'epson-tm-t88vi',
      imageMode: 'raster',
    });

    encoder.initialize();
    await encoder.image(imageData, imageData.width, imageData.height);
    encoder.cut();

    // Stream with backpressure
    for await (const chunk of encoder.encodeAsyncIterator({
      chunkSize: 512,
      onChunkSent: async info => {
        // Small delay to prevent buffer overflow
        await this.delay(5);
      },
    })) {
      await this.sendChunk(chunk);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

// Usage
async function printReceipt() {
  const printer = new TcpPrinterService('192.168.1.100', 9100);

  try {
    await printer.connect();

    const encoder = new ReceiptPrinterEncoder({
      printerModel: 'epson-tm-t88vi',
    });
    encoder.initialize().line('Hello from React Native!').cut();

    await printer.print(encoder.encode());
  } finally {
    printer.disconnect();
  }
}
```

---

### React Native Windows - Native Module

For Windows-specific TCP communication using a custom native module:

```javascript
import {NativeModules} from 'react-native';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

const {TcpPrinterModule} = NativeModules;

class WindowsPrinterService {
  constructor(host, port = 9100) {
    this.host = host;
    this.port = port;
    this.isConnected = false;
  }

  async connect() {
    try {
      await TcpPrinterModule.connect(this.host, this.port);
      this.isConnected = true;
      console.log(`Connected to printer at ${this.host}:${this.port}`);
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  async sendChunk(data) {
    if (!this.isConnected) {
      throw new Error('Not connected to printer');
    }

    // Convert Uint8Array to base64 for native module transfer
    const base64Data = this.uint8ArrayToBase64(data);
    await TcpPrinterModule.sendData(base64Data);
  }

  async print(data) {
    await this.sendChunk(data);
  }

  /**
   * Print large image with streaming
   * Prevents buffer overflow on Windows thermal printers
   */
  async printLargeImage(imageData, options = {}) {
    const {chunkSize = 512, chunkDelay = 10} = options;

    const encoder = new ReceiptPrinterEncoder({
      printerModel: 'epson-tm-t88vi',
      imageMode: 'raster',
    });

    encoder.initialize();
    await encoder.image(imageData, imageData.width, imageData.height);
    encoder.cut();

    let progress = 0;

    for await (const chunk of encoder.encodeAsyncIterator({
      chunkSize,
      onChunkSent: async info => {
        progress = Math.round((info.bytesSent / info.totalBytes) * 100);

        // Report progress to UI if needed
        if (options.onProgress) {
          options.onProgress(progress, info);
        }

        // Delay to prevent overwhelming the printer buffer
        if (!info.isLast) {
          await this.delay(chunkDelay);
        }
      },
    })) {
      await this.sendChunk(chunk);
    }

    return {success: true, progress: 100};
  }

  uint8ArrayToBase64(uint8Array) {
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect() {
    if (this.isConnected) {
      await TcpPrinterModule.disconnect();
      this.isConnected = false;
    }
  }
}

// Usage with progress reporting
async function printLargeReceipt(imageData) {
  const printer = new WindowsPrinterService('192.168.1.100', 9100);

  try {
    await printer.connect();

    await printer.printLargeImage(imageData, {
      chunkSize: 512,
      chunkDelay: 10,
      onProgress: (percent, info) => {
        console.log(
          `Printing: ${percent}% (chunk ${info.index + 1}/${info.total})`,
        );
        // Update your UI progress bar here
      },
    });

    console.log('Print completed successfully!');
  } catch (error) {
    console.error('Print failed:', error);
    throw error;
  } finally {
    await printer.disconnect();
  }
}
```

**Example Windows Native Module Interface (C#):**

```csharp
// TcpPrinterModule.cs (Windows native module)
[ReactModule("TcpPrinterModule")]
public class TcpPrinterModule
{
    private TcpClient _client;
    private NetworkStream _stream;

    [ReactMethod]
    public async Task ConnectAsync(string host, int port)
    {
        _client = new TcpClient();
        await _client.ConnectAsync(host, port);
        _stream = _client.GetStream();
    }

    [ReactMethod]
    public async Task SendDataAsync(string base64Data)
    {
        byte[] data = Convert.FromBase64String(base64Data);
        await _stream.WriteAsync(data, 0, data.Length);
        await _stream.FlushAsync();
    }

    [ReactMethod]
    public Task DisconnectAsync()
    {
        _stream?.Close();
        _client?.Close();
        return Task.CompletedTask;
    }
}
```

---

## Printer Configuration

### Using Built-in Printer Models

```javascript
// Get list of all supported printers
const printers = ReceiptPrinterEncoder.printerModels;
console.log(printers);
// [
//   { id: 'epson-tm-t88vi', name: 'Epson TM-T88VI' },
//   { id: 'star-tsp100iv', name: 'Star TSP100IV' },
//   ...
// ]

// Use specific printer model
const encoder = new ReceiptPrinterEncoder({
  printerModel: 'epson-tm-t88vi',
});

// Access printer capabilities
console.log(encoder.printerCapabilities);
// {
//   language: 'esc-pos',
//   codepages: 'epson',
//   fonts: { A: { size: '12x24', columns: 42 }, B: { size: '9x17', columns: 56 } },
//   images: { supportsCompression: true },
//   ...
// }
```

### Supported Printers

| Brand                | Models                                                                                     | RLE Compression |
| -------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| **Epson**            | TM-T88V, TM-T88VI, TM-T88VII, TM-T70II, TM-m30II, TM-m30III, TM-T20III, TM-T20IV, TM-P20II | ✅ Yes          |
| **Epson (Legacy)**   | TM-T88II, TM-T88III, TM-T88IV, TM-T70, TM-T20II                                            | ❌ No           |
| **Star**             | mC-Print2, mPOP, SM-L200, TSP100III, TSP100IV, TSP650, TSP650II                            | ❌ No           |
| **Bixolon**          | SRP-350III                                                                                 | ✅ Yes          |
| **Bixolon (Legacy)** | SRP-350                                                                                    | ❌ No           |
| **Citizen**          | CT-S310II                                                                                  | ✅ Yes          |
| **Fujitsu**          | FP-1000                                                                                    | ✅ Yes          |
| **HP**               | A779                                                                                       | ✅ Yes          |
| **Xprinter**         | XP-N160II, XP-T80Q                                                                         | ❌ No           |
| **Generic**          | POS-5890, POS-8360, MPT-II, Youku-58T                                                      | ❌ No           |

### Generic Configuration

```javascript
// Without specific printer model
const encoder = new ReceiptPrinterEncoder({
  language: 'esc-pos', // 'esc-pos', 'star-prnt', or 'star-line'
  columns: 42, // Paper width in characters
  imageMode: 'raster', // 'raster' or 'column'
});
```

---

## API Reference

### Constructor Options

```typescript
interface ReceiptPrinterEncoderOptions {
  printerModel?: string; // Printer model ID (recommended)
  language?: string; // 'esc-pos' | 'star-prnt' | 'star-line'
  columns?: number; // 32, 35, 42, 44, or 48
  imageMode?: string; // 'column' | 'raster'
  feedBeforeCut?: number; // Lines to feed before cut
  createCanvas?: Function; // Canvas factory for image processing
}
```

### Methods

| Method                                | Returns          | Description                              |
| ------------------------------------- | ---------------- | ---------------------------------------- |
| `initialize()`                        | `this`           | Reset printer to default state           |
| `text(value)`                         | `this`           | Print text                               |
| `line(value)`                         | `this`           | Print text with newline                  |
| `newline(count?)`                     | `this`           | Print empty lines                        |
| `align(value)`                        | `this`           | Set alignment: 'left', 'center', 'right' |
| `bold(enable?)`                       | `this`           | Toggle bold                              |
| `italic(enable?)`                     | `this`           | Toggle italic                            |
| `underline(enable?)`                  | `this`           | Toggle underline                         |
| `invert(enable?)`                     | `this`           | Toggle inverted (white on black)         |
| `size(width, height)`                 | `this`           | Set text size (1-8)                      |
| `font(value)`                         | `this`           | Set font: 'A', 'B', or size string       |
| `table(columns, rows)`                | `this`           | Print table                              |
| `rule()`                              | `this`           | Print horizontal rule                    |
| `box(options, callback)`              | `this`           | Draw box with content                    |
| `barcode(value, symbology, options?)` | `this`           | Print barcode                            |
| `qrcode(value, options?)`             | `this`           | Print QR code                            |
| `pdf417(value, options?)`             | `this`           | Print PDF417                             |
| `image(data, width, height)`          | `Promise<this>`  | Print image (async!)                     |
| `cut(type?)`                          | `this`           | Cut paper: 'full' or 'partial'           |
| `pulse()`                             | `this`           | Open cash drawer                         |
| `raw(data)`                           | `this`           | Send raw bytes                           |
| `encode()`                            | `Uint8Array`     | Get encoded data                         |
| `encodeAsyncIterator(options?)`       | `AsyncGenerator` | Stream encoded data                      |

### Image Data Format

```typescript
interface IImageData {
  data: Uint8ClampedArray | number[]; // RGBA pixels (4 bytes per pixel)
  width: number; // Must be multiple of 8
  height: number;
}
```

### Streaming Options

```typescript
interface EncodeAsyncIteratorOptions {
  chunkSize?: number; // Bytes per chunk (default: 512)
  onChunkSent?: (info: ChunkInfo) => void | Promise<void>;
}

interface ChunkInfo {
  index: number; // Current chunk index (0-based)
  total: number; // Total chunks
  bytes: number; // Bytes in this chunk
  bytesSent: number; // Cumulative bytes sent
  totalBytes: number; // Total payload size
  isLast: boolean; // Is this the last chunk?
}
```

---

## Troubleshooting

### 1. Large Image Causes App Crash / Out of Memory

**Problem:** Printing large raster receipts causes the app to crash or freeze.

**Solution:** Use `encodeAsyncIterator()` for streaming transmission:

```javascript
// ❌ Bad - loads entire payload into memory
const data = encoder.encode();
await printer.print(data);

// ✅ Good - streams in chunks
for await (const chunk of encoder.encodeAsyncIterator({chunkSize: 512})) {
  await printer.sendChunk(chunk);
}
```

### 2. Printer Buffer Overflow / Partial Print

**Problem:** Large images print partially or printer stops mid-print.

**Solution:** Add delays between chunks to let the printer process:

```javascript
for await (const chunk of encoder.encodeAsyncIterator({
  chunkSize: 256, // Smaller chunks
  onChunkSent: async () => {
    await delay(10); // 10ms delay between chunks
  },
})) {
  await printer.sendChunk(chunk);
}
```

### 3. Image Width Must Be Multiple of 8

**Problem:** `Error: ImageEncoder: width must be a multiple of 8`

**Solution:** Resize your image to valid width:

```javascript
// Common valid widths for 80mm paper at 203 DPI
const validWidths = [384, 512, 576]; // Choose based on printer

function adjustImageWidth(imageData) {
  const targetWidth = Math.ceil(imageData.width / 8) * 8;
  // Resize image to targetWidth
}
```

### 4. Garbled Output / Wrong Encoding

**Problem:** Text prints as garbage characters.

**Solution:** Ensure correct codepage:

```javascript
const encoder = new ReceiptPrinterEncoder({
  printerModel: 'epson-tm-t88vi',
});

encoder
  .initialize()
  .codepage('auto') // Auto-detect codepage
  .line('Special chars: áéíóú ñ €')
  .cut();
```

### 5. Connection Timeout on Windows

**Problem:** Native module connection times out.

**Solution:** Increase timeout and add retry logic:

```javascript
async function connectWithRetry(printer, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await printer.connect();
      return;
    } catch (error) {
      console.warn(`Connection attempt ${i + 1} failed:`, error);
      await delay(1000 * (i + 1)); // Exponential backoff
    }
  }
  throw new Error('Failed to connect after multiple attempts');
}
```

### 6. Star Printer Not Printing Images

**Problem:** Star printers don't support RLE compression.

**Solution:** Use column mode (default for Star):

```javascript
const encoder = new ReceiptPrinterEncoder({
  printerModel: 'star-tsp100iv', // Automatically uses star-prnt language
  imageMode: 'column', // Column mode for Star printers
});
```

### 7. Print Queue Builds Up

**Problem:** Multiple prints stack up and printer can't keep up.

**Solution:** Implement a print queue with proper waiting:

```javascript
class PrintQueue {
  constructor(printer) {
    this.printer = printer;
    this.queue = [];
    this.isProcessing = false;
  }

  async add(encoder) {
    this.queue.push(encoder);
    if (!this.isProcessing) {
      await this.process();
    }
  }

  async process() {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const encoder = this.queue.shift();

      for await (const chunk of encoder.encodeAsyncIterator({
        chunkSize: 512,
      })) {
        await this.printer.sendChunk(chunk);
      }

      // Wait between print jobs
      await delay(500);
    }

    this.isProcessing = false;
  }
}
```

---

## License

MIT License - See [LICENSE](LICENSE) for details.

## Credits

Based on [ReceiptPrinterEncoder](https://github.com/NielsLeenheer/ReceiptPrinterEncoder) by Niels Leenheer.

Enhanced with enterprise-grade image processing, RLE compression, and streaming support.
