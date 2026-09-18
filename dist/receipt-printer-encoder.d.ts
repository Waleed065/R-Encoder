import { Codepage } from '@point-of-sale/codepage-encoder';
import ImageData from '@canvas/image-data';

type PrinterModel = 'bixolon-srp350' | 'bixolon-srp350iii' | 'citizen-ct-s310ii' | 'epson-tm-m30ii' | 'epson-tm-m30iii' | 'epson-tm-p20ii' | 'epson-tm-t20ii' | 'epson-tm-t20iii' | 'epson-tm-t20iv' | 'epson-tm-t70' | 'epson-tm-t70ii' | 'epson-tm-t88ii' | 'epson-tm-t88iii' | 'epson-tm-t88iv' | 'epson-tm-t88v' | 'epson-tm-t88vi' | 'epson-tm-t88vii' | 'fujitsu-fp1000' | 'hp-a779' | 'meow' | 'metapace-t1' | 'mpt-ii' | 'pos-5890' | 'pos-8360' | 'star-mc-print2' | 'star-mpop' | 'star-sm-l200' | 'star-tsp100iii' | 'star-tsp100iv' | 'star-tsp650' | 'star-tsp650ii' | 'sunmi-p2se' | 'sunmi-p3h' | 'sunmi-p3kh' | 'sunmi-p3mix' | 'sunmi' | 'xprinter-xp-n160ii' | 'xprinter-xp-t80q' | 'youku-58t';
type CodepageMappingName = 'bixolon' | 'bixolon/legacy' | 'citizen' | 'epson' | 'epson/legacy' | 'fujitsu' | 'hp' | 'metapace' | 'mpt' | 'pos-5890' | 'pos-8360' | 'star' | 'sunmi' | 'xprinter' | 'youku';

type Language = "esc-pos" | "star-prnt" | "star-line";
type Alignment = "left" | "center" | "right";
type DitherAlgorithm = "threshold" | "bayer" | "floydsteinberg" | "atkinson";
type ErrorLevel = "relaxed" | "strict";
type TextSize = "small" | "normal";
type CutType = "full" | "partial";
type LineSpacing = "default" | "none";
type BarcodeSymbology = "upca" | "upce" | "ean13" | "ean8" | "code39" | "itf" | "codabar" | "code93" | "code128" | "code128-auto" | "gs1-128" | "gs1-databar-omni" | "gs1-databar-truncated" | "gs1-databar-limited" | "gs1-databar-expanded";
type ReceiptPrinterEncoderOptions = {
    columns?: number | undefined;
    language?: Language | undefined;
    imageMode?: "column" | "raster" | undefined;
    feedBeforeCut?: number | undefined;
    feedAfterBlock?: boolean | undefined;
    newline?: "\n" | "\n\r" | undefined;
    codepageMapping?: Record<string, number> | CodepageMappingName | undefined;
    codepageCandidates?: Codepage[] | undefined;
    errors?: ErrorLevel | undefined;
    printerModel?: PrinterModel | undefined;
    debug?: boolean | undefined;
    embedded?: boolean | undefined;
    createCanvas?: ((width: number, height: number) => HTMLCanvasElement) | null | undefined;
    receiptline?: ReceiptLineModule | null | undefined;
    width?: number | undefined;
    autoFlush?: boolean | undefined;
};
type ReceiptLineTransform = (encoder: ReceiptPrinterEncoder, document: string, options?: object | undefined) => Promise<ReceiptPrinterEncoder>;
type ReceiptLineModule = {
    transform: ReceiptLineTransform;
};
type TableColumn = {
    width?: number | "auto" | undefined;
    align?: Alignment | undefined;
    verticalAlign?: "top" | "bottom" | undefined;
    overflow?: "clip" | "wrap" | "ellipsis" | undefined;
    marginLeft?: number | undefined;
    marginRight?: number | undefined;
};
type RuleOptions = {
    style?: "double" | "single" | undefined;
    width?: number | undefined;
};
type BoxOptions = {
    outline?: "none" | "double" | "single" | undefined;
    corners?: "square" | "rounded" | undefined;
    style?: "none" | "double" | "single" | undefined;
    width?: number | undefined;
    align?: Alignment | undefined;
    marginLeft?: number | undefined;
    marginRight?: number | undefined;
    paddingLeft?: number | undefined;
    paddingRight?: number | undefined;
};
type BarcodeText = "none" | "above" | "below" | "both";
type BarcodeOptions = {
    height?: number | undefined;
    width?: number | undefined;
    text?: boolean | BarcodeText | undefined;
};
type QRCodeOptions = {
    model?: 2 | 1 | undefined;
    size?: number | undefined;
    errorlevel?: "q" | "l" | "m" | "h" | undefined;
};
type PDF417Options = {
    width?: number | undefined;
    height?: number | undefined;
    columns?: number | undefined;
    rows?: number | undefined;
    errorlevel?: number | undefined;
    truncated?: boolean | undefined;
};
type ImageOptions = {
    width?: number | undefined;
    height?: number | undefined;
    algorithm?: DitherAlgorithm | undefined;
    threshold?: number | undefined;
    mode?: "column" | "raster" | undefined;
};
type SharpInput = Object;
type NdarrayInput = Object;
type ReadImageInput = Object;
type ImageInput = ImageData | HTMLImageElement | HTMLCanvasElement | SharpInput | NdarrayInput | ReadImageInput;
type PrinterModelInfo = {
    id: string;
    name: string;
};
type TableCellContent = string | ((encoder: ReceiptPrinterEncoder) => void);
type TableCellBorder = {
    top?: "none" | "double" | "single" | undefined;
    right?: "none" | "double" | "single" | undefined;
    bottom?: "none" | "double" | "single" | undefined;
    left?: "none" | "double" | "single" | undefined;
};
type TableOutline = {
    top?: "none" | "double" | "single" | undefined;
    right?: "none" | "double" | "single" | undefined;
    bottom?: "none" | "double" | "single" | undefined;
    left?: "none" | "double" | "single" | undefined;
};
type TableCellObject = {
    span?: number | undefined;
    content?: TableCellContent | undefined;
    align?: Alignment | undefined;
    border?: "none" | "double" | "single" | TableCellBorder | undefined;
    marginLeft?: number | undefined;
    marginRight?: number | undefined;
};
type TableCell = TableCellContent | TableCellObject;
type TableRule = {
    rule: true;
};
type TableRow = TableCell[] | TableRule;
type TableOptions = {
    border?: "none" | "double" | "single" | undefined;
    corners?: "square" | "rounded" | undefined;
    rules?: "all" | "none" | undefined;
    outline?: "none" | "double" | "single" | TableOutline | undefined;
    width?: number | undefined;
};
type BoxContent = string | ((encoder: ReceiptPrinterEncoder) => void);
declare class ReceiptPrinterEncoder {
    static "__#private@#resolveCell"(covered: TableColumn[], cell: TableCell, layout: object, index: number): object;
    static "__#private@#resolveMargin"(cell: TableCell, property: string, margin: number, index: number): number;
    static "__#private@#resolveBorder"(cell: TableCell, layout: object, index: number): object;
    static "__#private@#tableStyles"(options: TableOptions, outline: object): string[];
    static "__#private@#resolveOutline"(options: TableOptions): object;
    static "__#private@#validateSides"(value: object, sides: object, message: string): void;
    static "__#private@#resolveSides"(value: "none" | "single" | "double" | TableCellBorder, styles: string[], message: string): object;
    static "__#private@#applyStyles"(rows: any[], outline: object, border: string): void;
    static "__#private@#isCellObject"(cell: TableCell): boolean;
    static "__#private@#tableEdges"(cells: object[]): any[];
    static "__#private@#tableRules"(cells: object[], layout: object): Map<any, any>;
    static "__#private@#tableColumn"(cells: object[], c: number, layout: object): boolean;
    static "__#private@#tableSegments"(above: object[], below: object[], layout: object, width: number): Set<any>;
    static "__#private@#borderShape"(up: boolean, down: boolean, left: boolean, right: boolean): string;
    static "__#private@#tableShapes"(width: number, up: Map<any, any>, down: Map<any, any>, covered: Set<any>, style: string): object[] | null;
    static get printerModels(): PrinterModelInfo[];
    constructor(options?: ReceiptPrinterEncoderOptions);
    initialize(): ReceiptPrinterEncoder;
    codepage(codepage: Codepage | "auto"): ReceiptPrinterEncoder;
    text(value: string): ReceiptPrinterEncoder;
    newline(value?: number): ReceiptPrinterEncoder;
    line(value: string): ReceiptPrinterEncoder;
    underline(value?: boolean): ReceiptPrinterEncoder;
    italic(value?: boolean): ReceiptPrinterEncoder;
    bold(value?: boolean): ReceiptPrinterEncoder;
    invert(value?: boolean): ReceiptPrinterEncoder;
    width(width?: number): ReceiptPrinterEncoder;
    height(height?: number): ReceiptPrinterEncoder;
    size(width: number, height?: number | undefined): ReceiptPrinterEncoder;
    size(value: TextSize): ReceiptPrinterEncoder;
    font(value: string): ReceiptPrinterEncoder;
    align(value: Alignment): ReceiptPrinterEncoder;
    lineSpacing(value: LineSpacing): ReceiptPrinterEncoder;
    table(columns: TableColumn[], data: TableRow[], options?: TableOptions): ReceiptPrinterEncoder;
    rule(options?: RuleOptions): ReceiptPrinterEncoder;
    box(options: BoxOptions, contents: BoxContent): ReceiptPrinterEncoder;
    markdown(value: string): ReceiptPrinterEncoder;
    receiptline(value: string, options?: object): Promise<ReceiptPrinterEncoder>;
    barcode(value: string, symbology: BarcodeSymbology | number, height?: number | BarcodeOptions): ReceiptPrinterEncoder;
    qrcode(value: string, model?: number | QRCodeOptions, size?: number, errorlevel?: string): ReceiptPrinterEncoder;
    pdf417(value: string, options?: PDF417Options): ReceiptPrinterEncoder;
    image(input: ImageInput, options?: ImageOptions | undefined): ReceiptPrinterEncoder;
    image(input: ImageInput, width: number, height: number, algorithm?: DitherAlgorithm | undefined, threshold?: number | undefined): ReceiptPrinterEncoder;
    cut(value?: CutType): ReceiptPrinterEncoder;
    pulse(device?: number, on?: number, off?: number): ReceiptPrinterEncoder;
    raw(data: number[] | Uint8Array): ReceiptPrinterEncoder;
    commands(): {
        commands: object[];
        height: number;
    }[];
    encode(format: "commands"): {
        commands: object[];
        height: number;
    }[];
    encode(format: "lines"): object[][];
    encode(format?: string | undefined): Uint8Array;
    get columns(): number;
    get printableWidth(): number;
    get language(): string;
    get printerCapabilities(): object;
    #private;
}

export { ReceiptPrinterEncoder as default };
export type { Alignment, BarcodeOptions, BarcodeSymbology, BarcodeText, BoxContent, BoxOptions, CutType, DitherAlgorithm, ErrorLevel, ImageInput, ImageOptions, Language, LineSpacing, NdarrayInput, PDF417Options, PrinterModelInfo, QRCodeOptions, ReadImageInput, ReceiptLineModule, ReceiptLineTransform, ReceiptPrinterEncoderOptions, RuleOptions, SharpInput, TableCell, TableCellBorder, TableCellContent, TableCellObject, TableColumn, TableOptions, TableOutline, TableRow, TableRule, TextSize };
