interface IImageData {
  data: number[];
  height: number;
  width: number;
  colorSpace: string;
  pixelFormat?: string;
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
  image(input: IImageData, width: number, height: number): this;
  cut(value?: string): this;
  pulse(device?: number, on?: number, off?: number): this;
  raw(data: any[]): this;
  commands(): any[];
  encode(format?: "commands" | "lines" | "array"): Uint8Array | any[];
  readonly columns: number;
  readonly language: string;
  readonly printerCapabilities: object;
  static readonly printerModels: { id: string; name: string }[];
}
