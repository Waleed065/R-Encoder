import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import ImageData from '@canvas/image-data';
import { assert } from 'chai';

/* Images, barcodes, QR codes and PDF417 codes cannot be padded with spaces, so
   they are aligned with the alignment command of the printer. The reset to left
   alignment is sent after the line feed, because printers only process the
   alignment command at the start of a line, see #42. The line with the reset
   holds nothing but the reset, so it gets no line feed of its own */

describe('Alignment around blocks', function() {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const STAR_CODEPAGE = [ 27, 29, 116, 0 ];
    const TEXT = [ 116, 101, 120, 116 ];

    const ALIGN_LEFT = [ 27, 97, 0 ];
    const ALIGN_CENTER = [ 27, 97, 1 ];
    const ALIGN_RIGHT = [ 27, 97, 2 ];
    const STAR_ALIGN_LEFT = [ 27, 29, 97, 0 ];
    const STAR_ALIGN_RIGHT = [ 27, 29, 97, 2 ];

    const IMAGE = [ 29, 118, 48, 0, 1, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];
    const STAR_IMAGE = [ 27, 48, 27, 88, 8, 0, ...new Array(24).fill(0), 10, 13, 27, 122, 1 ];
    const BARCODE = [ 29, 104, 60, 29, 119, 3, 29, 72, 0, 29, 107, 73, 9, 123, 66, 67, 79, 68, 69, 49, 50, 56 ];
    const QRCODE = [ 29, 40, 107, 4, 0, 49, 65, 50, 0, 29, 40, 107, 3, 0, 49, 67, 6, 29, 40, 107, 3, 0, 49, 69, 49, 29, 40, 107, 4, 0, 49, 80, 48, 120, 29, 40, 107, 3, 0, 49, 81, 48 ];
    const PDF417 = [ 29, 40, 107, 3, 0, 48, 65, 0, 29, 40, 107, 3, 0, 48, 66, 0, 29, 40, 107, 3, 0, 48, 67, 3, 29, 40, 107, 3, 0, 48, 68, 3, 29, 40, 107, 4, 0, 48, 69, 48, 49, 29, 40, 107, 3, 0, 48, 70, 0, 29, 40, 107, 4, 0, 48, 80, 48, 120, 29, 40, 107, 3, 0, 48, 81, 48 ];

    const image = new ImageData(8, 8);
    image.data.fill(255);

    const tall = new ImageData(8, 24);
    tall.data.fill(255);

    describe('align(right).image().align(left).line(text)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.align('right').image(image, 8, 8).align('left').line('text').encode();

        it('should reset the alignment after the line feed of the image', function () {
            assert.deepEqual(new Uint8Array([ ...ALIGN_RIGHT, ...IMAGE, ...NL, ...ALIGN_LEFT, ...CODEPAGE, ...TEXT, ...NL ]), result);
        });

        it('should print exactly one line feed between the image and the text', function () {
            const blockEnd = ALIGN_RIGHT.length + IMAGE.length;
            const textStart = result.length - (TEXT.length + NL.length);

            const feeds = Array.from(result.slice(blockEnd, textStart)).filter((byte) => byte === 0x0a).length;

            assert.equal(1, feeds);
        });
    });

    describe('align(center).barcode(CODE128, code128, 60).align(left).line(text)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos' });
        let result = encoder.align('center').barcode('CODE128', 'code128', 60).align('left').line('text').encode();

        it('should reset the alignment after the line feed of the barcode', function () {
            assert.deepEqual(new Uint8Array([ ...ALIGN_CENTER, ...BARCODE, ...NL, ...ALIGN_LEFT, ...CODEPAGE, ...TEXT, ...NL ]), result);
        });
    });

    describe('align(center).qrcode(x).align(left).line(text)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos' });
        let result = encoder.align('center').qrcode('x').align('left').line('text').encode();

        it('should reset the alignment after the line feed of the qr code', function () {
            assert.deepEqual(new Uint8Array([ ...ALIGN_CENTER, ...QRCODE, ...NL, ...ALIGN_LEFT, ...CODEPAGE, ...TEXT, ...NL ]), result);
        });
    });

    describe('align(center).pdf417(x).align(left).line(text)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos' });
        let result = encoder.align('center').pdf417('x').align('left').line('text').encode();

        it('should reset the alignment after the line feed of the pdf417 code', function () {
            assert.deepEqual(new Uint8Array([ ...ALIGN_CENTER, ...PDF417, ...NL, ...ALIGN_LEFT, ...CODEPAGE, ...TEXT, ...NL ]), result);
        });
    });

    describe('align(right).image().align(left).line(text) with feedAfterBlock false', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster', feedAfterBlock: false });
        let result = encoder.align('right').image(image, 8, 8).align('left').line('text').encode();

        it('should send the reset directly after the image, as before', function () {
            assert.deepEqual(new Uint8Array([ ...ALIGN_RIGHT, ...IMAGE, ...ALIGN_LEFT, ...CODEPAGE, ...TEXT, ...NL ]), result);
        });
    });

    describe('align(right).image().align(left).line(text) on star-prnt', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'star-prnt', autoFlush: false });
        let result = encoder.align('right').image(tall, 8, 24).align('left').line('text').encode();

        it('should reset the alignment after the line feed of the image', function () {
            assert.deepEqual(new Uint8Array([ ...STAR_ALIGN_RIGHT, ...STAR_IMAGE, ...NL, ...STAR_ALIGN_LEFT, ...STAR_CODEPAGE, ...TEXT, ...NL ]), result);
        });
    });

    describe('image().line(text)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(image, 8, 8).line('text').encode();

        it('should not send an alignment command at all', function () {
            assert.deepEqual(new Uint8Array([ ...IMAGE, ...NL, ...CODEPAGE, ...TEXT, ...NL ]), result);
        });
    });

    describe('align(right).image().image()', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.align('right').image(image, 8, 8).image(image, 8, 8).encode();

        it('should reset the alignment after each image and set it again for the next', function () {
            assert.deepEqual(new Uint8Array([
                ...ALIGN_RIGHT, ...IMAGE, ...NL, ...ALIGN_LEFT,
                ...ALIGN_RIGHT, ...IMAGE, ...NL, ...ALIGN_LEFT,
            ]), result);
        });
    });
});
