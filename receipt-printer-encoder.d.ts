interface IImageData {
  data: Uint8ClampedArray | number[];
  height: number;
  width: number;
  colorSpace?: string;
  pixelFormat?: string;
}

/**
 * Chunk information yielded by encodeAsyncIterator and ImageEncoder
 */
interface ChunkInfo {
  /** Zero-based chunk index */
  index: number;
  /** Total number of chunks */
  total: number;
  /** Bytes in this chunk */
  bytes: number;
  /** Total bytes sent so far including this chunk */
  bytesSent: number;
  /** Total bytes in the complete payload */
  totalBytes: number;
  /** Whether this is the final chunk */
  isLast: boolean;
}

/**
 * Options for the encodeAsyncIterator method
 */
interface EncodeAsyncIteratorOptions {
  /** Size of each chunk in bytes (default: 512) */
  chunkSize?: number;
  /**
   * Callback invoked after each chunk is yielded.
   * Return a Promise to implement backpressure.
   */
  onChunkSent?: (info: ChunkInfo) => void | Promise<void>;
}

/**
 * RLE compression result
 */
interface RLEResult {
  /** Compressed or original data */
  data: Uint8Array;
  /** Whether compression was applied */
  compressed: boolean;
  /** Original data size */
  originalSize: number;
  /** Resulting data size */
  compressedSize: number;
  /** Compression ratio (< 1.0 means compression helped) */
  ratio: number;
}

/**
 * Raster bitmap result
 */
interface RasterResult {
  /** Raster bitmap data */
  data: Uint8Array;
  /** Width in bytes (width / 8) */
  widthBytes: number;
  /** Height in pixels */
  height: number;
}

/**
 * Image processing options
 */
interface ImageProcessOptions {
  /** Use RLE compression if supported */
  useCompression?: boolean;
  /** Yield control every N pixels for async processing */
  yieldInterval?: number;
}

/**
 * Printer capabilities for images
 */
interface ImageCapabilities {
  /** Image encoding mode ('column' or 'raster') */
  mode?: "column" | "raster";
  /** Whether the printer supports RLE compression */
  supportsCompression?: boolean;
}

/**
 * Printer capabilities definition
 */
interface PrinterCapabilities {
  language: string;
  codepages: string;
  fonts: Record<string, { size: string; columns: number }>;
  barcodes?: {
    supported: boolean;
    symbologies: string[];
  };
  qrcode?: {
    supported: boolean;
    models: string[];
  };
  pdf417?: {
    supported: boolean;
  };
  images?: ImageCapabilities;
  cutter?: {
    feed: number;
  };
  newline?: string;
}

export interface ReceiptPrinterEncoderOptions {
  columns?: number;
  language?: string;
  imageMode?: string;
  feedBeforeCut?: number;
  newline?: string;
  codepageMapping?: string;
  codepageCandidates?: string[] | null;
  errors?: string;
  debug?: boolean;
  embedded?: boolean;
  createCanvas?: any;
  width?: number;
  printerModel?: string;
  autoFlush?: boolean;
}

export default class ReceiptPrinterEncoder {
  constructor(options?: ReceiptPrinterEncoderOptions);

  initialize(): this;
  codepage(codepage: string): this;
  text(value: string): this;
  newline(value?: number): this;
  line(value: string): this;
  underline(value?: boolean | number): this;
  italic(value?: boolean): this;
  bold(value?: boolean): this;
  invert(value?: boolean): this;
  width(width: number): this;
  height(height: number): this;
  size(width: number | string, height?: number): this;
  font(value: string): this;
  align(value: "left" | "center" | "right"): this;
  table(columns: any[], data: any[][]): this;
  rule(options?: object): this;
  box(
    options: object,
    contents: string | ((encoder: ReceiptPrinterEncoder) => void)
  ): this;
  barcode(
    value: string,
    symbology: string | number,
    height?: number | object
  ): this;
  qrcode(
    value: string,
    model?: number | object,
    size?: number,
    errorlevel?: string
  ): this;
  pdf417(value: string, options?: object): this;
  image(input: IImageData, width: number, height: number): Promise<this>;
  cut(value?: string): this;
  pulse(device?: number, on?: number, off?: number): this;
  raw(data: any[]): this;
  commands(): any[];
  encode(format?: "commands" | "lines" | "array"): Uint8Array | string;

  /**
   * Encode all previous commands and return an async iterator for streaming transmission.
   * This method enables backpressure-aware transmission to printers with limited buffers.
   */
  encodeAsyncIterator(
    options?: EncodeAsyncIteratorOptions
  ): AsyncGenerator<Uint8Array, void, unknown>;

  readonly columns: number;
  readonly language: string;
  readonly printerCapabilities: PrinterCapabilities;
  static readonly printerModels: { id: string; name: string }[];
}

/**
 * Enterprise-grade Image Encoder for receipt printers.
 * Provides memory-efficient image processing with RLE compression,
 * chunked transmission, and streaming support.
 */
export class ImageEncoder {
  /** Default chunk size for transmission (512 bytes) */
  static readonly DEFAULT_CHUNK_SIZE: number;

  /** Maximum RLE run length per ESC/POS spec */
  static readonly MAX_RLE_RUN: number;

  /**
   * Validate image input data
   */
  static validateImage(image: IImageData): void;

  /**
   * Validate dimensions for printing
   */
  static validateDimensions(width: number, height: number): void;

  /**
   * Get pixel value at coordinates (0 = white/transparent, 1 = black)
   */
  static getPixel(
    image: IImageData,
    x: number,
    y: number,
    width: number,
    height: number
  ): number;

  /**
   * Convert image to raster bitmap format (row-major, MSB first)
   */
  static pixelsToRaster(
    image: IImageData,
    width: number,
    height: number
  ): RasterResult;

  /**
   * Convert image to column format (24-dot vertical strips)
   */
  static pixelsToColumns(
    image: IImageData,
    width: number,
    height: number
  ): Uint8Array[];

  /**
   * Compress data using RLE (Run-Length Encoding)
   * Compatible with ESC/POS GS v 0 mode 1
   */
  static compressRLE(data: Uint8Array): RLEResult;

  /**
   * Decompress RLE data
   */
  static decompressRLE(data: Uint8Array): Uint8Array;

  /**
   * Generate payload chunks for streaming transmission
   */
  static generateChunks(
    payload: Uint8Array,
    chunkSize?: number
  ): Generator<{
    chunk: Uint8Array;
    index: number;
    total: number;
    isLast: boolean;
    byteOffset: number;
    totalBytes: number;
  }>;

  /**
   * Async generator for chunked transmission with backpressure support
   */
  static generateChunksAsync(
    payload: Uint8Array,
    chunkSize?: number,
    onChunkReady?: (info: ChunkInfo) => void | Promise<void>
  ): AsyncGenerator<{
    chunk: Uint8Array;
    index: number;
    total: number;
    isLast: boolean;
    byteOffset: number;
    totalBytes: number;
  }>;

  /**
   * Concatenate multiple Uint8Arrays efficiently
   */
  static concatenate(...arrays: Uint8Array[]): Uint8Array;

  /**
   * Build ESC/POS raster image command (GS v 0)
   */
  static buildRasterCommand(
    rasterData: Uint8Array,
    widthBytes: number,
    height: number,
    useCompression?: boolean
  ): { command: Uint8Array; compressed: boolean; ratio: number };

  /**
   * Build ESC/POS column image command (ESC *)
   */
  static buildColumnCommand(stripData: Uint8Array, width: number): Uint8Array;

  /**
   * Build line spacing command
   */
  static buildLineSpacingCommand(dots: number): Uint8Array;

  /**
   * Build Star PRNT column image command (ESC X)
   */
  static buildStarColumnCommand(
    stripData: Uint8Array,
    width: number
  ): Uint8Array;

  /**
   * Release memory pool resources
   */
  static releasePool(): void;

  /**
   * Process image asynchronously with yielding for large images
   */
  static processImageAsync(
    image: IImageData,
    width: number,
    height: number,
    mode: "column" | "raster",
    options?: ImageProcessOptions
  ): Promise<{ commands: Uint8Array[]; compressed: boolean }>;
}
