export interface IImageData {
  data: Uint8ClampedArray | number[];
  height: number;
  width: number;
  colorSpace?: string;
  pixelFormat?: string;
}

/**
 * Chunk information yielded by encodeAsyncIterator and ImageEncoder
 */
export interface ChunkInfo {
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
export interface EncodeAsyncIteratorOptions {
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
export interface RLEResult {
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
export interface RasterResult {
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
export interface ImageProcessOptions {
  /** Use RLE compression if supported */
  useCompression?: boolean;
  /** Yield control every N pixels for async processing */
  yieldInterval?: number;
}

/**
 * Printer capabilities for images
 */
export interface ImageCapabilities {
  /** Image encoding mode ('column' or 'raster') */
  mode?: "column" | "raster";
  /** Whether the printer supports RLE compression */
  supportsCompression?: boolean;
}

/**
 * Printer capabilities definition
 */
export interface PrinterCapabilities {
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
    contents: string | ((encoder: ReceiptPrinterEncoder) => void),
  ): this;
  barcode(
    value: string,
    symbology: string | number,
    height?: number | object,
  ): this;
  qrcode(
    value: string,
    model?: number | object,
    size?: number,
    errorlevel?: string,
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
    options?: EncodeAsyncIteratorOptions,
  ): AsyncGenerator<Uint8Array, void, unknown>;

  readonly columns: number;
  readonly language: string;
  readonly printerCapabilities: PrinterCapabilities;
  static readonly printerModels: { id: string; name: string }[];
}

/*
 * NOTE: The image processing helpers (ImageEncoder, RLE compression, chunk
 * generation) are an internal implementation detail and are NOT exported from
 * the package. They are used internally by ReceiptPrinterEncoder.image() and
 * ReceiptPrinterEncoder.encodeAsyncIterator().
 */
