import ReceiptPrinterEncoder from "../../src/receipt-printer-encoder.js";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

let image = PNG.sync.read(readFileSync('image.png'));

let encoder = new ReceiptPrinterEncoder();

let result = encoder
    .initialize()
    .image(image, 64, 64, 'atkinson')
    .encode();

console.log(result);
