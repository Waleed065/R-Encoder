import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import ImageData from '@canvas/image-data';
import { assert } from 'chai';

/* Column mode images are printed in strips of 24 dots. The line spacing between
   the strips is set in motion units, which are half a dot on Epson printers and
   one dot on many others. When the resolution of the printer is known, the
   motion unit is set to one dot explicitly, see #47 */

describe('Column mode images', function() {
    const LINE_SPACING_24 = [ 27, 51, 24 ];
    const LINE_SPACING_DEFAULT = [ 27, 50 ];
    const MOTION_UNIT = (dpi) => [ 29, 80, dpi, dpi ];
    const MOTION_UNIT_DEFAULT = [ 29, 80, 0, 0 ];
    const STRIP = [ 27, 42, 33, 8, 0, ...new Array(24).fill(0), 10 ];
    const NL = [ 10, 13 ];

    const image = (height) => {
        const data = new ImageData(8, height);
        data.data.fill(255);
        return data;
    };

    describe('image(8 x 48) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'column' });
        let result = encoder.image(image(48), 8, 48).encode();

        it('should use 24 units of line spacing for two strips, without changing the motion unit', function () {
            assert.deepEqual(new Uint8Array([ ...LINE_SPACING_24, ...STRIP, ...STRIP, ...LINE_SPACING_DEFAULT, ...NL ]), result);
        });
    });

    describe('image(8 x 8) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'column' });
        let result = encoder.image(image(8), 8, 8).encode();

        it('should pad a partial strip to 24 dots', function () {
            assert.deepEqual(new Uint8Array([ ...LINE_SPACING_24, ...STRIP, ...LINE_SPACING_DEFAULT, ...NL ]), result);
        });
    });

    describe('image(8 x 48) on an Epson TM-T88V, 180 dpi', function () {
        let encoder = new ReceiptPrinterEncoder({ printerModel: 'epson-tm-t88v', imageMode: 'column' });
        let result = encoder.image(image(48), 8, 48).encode();

        it('should set the motion unit to one dot around the image and restore it', function () {
            assert.deepEqual(new Uint8Array([
                ...MOTION_UNIT(180), ...LINE_SPACING_24, ...STRIP, ...STRIP, ...LINE_SPACING_DEFAULT, ...MOTION_UNIT_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('image(8 x 24) on an Xprinter XP-T80Q, 203 dpi', function () {
        let encoder = new ReceiptPrinterEncoder({ printerModel: 'xprinter-xp-t80q', imageMode: 'column' });
        let result = encoder.image(image(24), 8, 24).encode();

        it('should use the resolution of the printer as the motion unit', function () {
            assert.deepEqual(new Uint8Array([
                ...MOTION_UNIT(203), ...LINE_SPACING_24, ...STRIP, ...LINE_SPACING_DEFAULT, ...MOTION_UNIT_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('image(8 x 8) on an Epson TM-T70, raster mode by profile', function () {
        let encoder = new ReceiptPrinterEncoder({ printerModel: 'epson-tm-t70' });
        let result = encoder.image(image(8), 8, 8).encode();

        it('should not touch the motion unit in raster mode', function () {
            assert.deepEqual(new Uint8Array([ 29, 118, 48, 0, 1, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...NL ]), result);
        });
    });
});

/* Raster mode images are sent in chunks of at most 255 rows, because there is
   firmware that reads only the low byte of the row count of GS v 0 and prints
   the rest of the pixel data as text and commands, see #16 */

describe('Raster mode images', function() {
    const NL = [ 10, 13 ];

    const image = (width, height) => {
        const data = new ImageData(width, height);
        data.data.fill(255);
        return data;
    };

    /* One GS v 0 command for a white chunk of the given number of rows */

    const RASTER = (width, rows) => {
        const bytesPerRow = width >> 3;

        return [
            29, 118, 48, 0,
            bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
            rows & 0xff, (rows >> 8) & 0xff,
            ...new Array(rows * bytesPerRow).fill(0),
        ];
    };

    describe('image(8 x 8) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(image(8, 8), 8, 8).encode();

        it('should send one command with 8 rows', function () {
            assert.deepEqual(new Uint8Array([ 29, 118, 48, 0, 1, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...NL ]), result);
        });
    });

    /* The height is padded to a multiple of 8 dots before the image reaches the
       language, so 248 rows is the tallest image that fits in one command */

    describe('image(8 x 248) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(image(8, 248), 8, 248).encode();

        it('should send one command with a row count of 248 and a high byte of 0', function () {
            assert.deepEqual(new Uint8Array([ ...RASTER(8, 248), ...NL ]), result);
        });
    });

    describe('image(8 x 255) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(image(8, 255), 8, 255).encode();

        it('should pad to 256 rows and send a chunk of 255 rows, with a high byte of 0, and one of 1 row', function () {
            assert.deepEqual(new Uint8Array([ ...RASTER(8, 255), ...RASTER(8, 1), ...NL ]), result);
        });
    });

    describe('image(8 x 256) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(image(8, 256), 8, 256).encode();

        it('should send two commands, of 255 and 1 rows', function () {
            assert.deepEqual(new Uint8Array([ ...RASTER(8, 255), ...RASTER(8, 1), ...NL ]), result);
        });
    });

    describe('image(8 x 288) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(image(8, 288), 8, 288).encode();

        it('should send two commands, of 255 and 33 rows', function () {
            assert.deepEqual(new Uint8Array([ ...RASTER(8, 255), ...RASTER(8, 33), ...NL ]), result);
        });
    });

    describe('image(8 x 512) without a printer model', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(image(8, 512), 8, 512).encode();

        it('should send three commands, of 255, 255 and 2 rows', function () {
            assert.deepEqual(new Uint8Array([ ...RASTER(8, 255), ...RASTER(8, 255), ...RASTER(8, 2), ...NL ]), result);
        });
    });

    describe('image(8 x 288) with feedAfterBlock false', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster', feedAfterBlock: false });
        let result = encoder.image(image(8, 288), 8, 288).encode();

        it('should send two commands and no line feed after them', function () {
            assert.deepEqual(new Uint8Array([ ...RASTER(8, 255), ...RASTER(8, 33) ]), result);
        });
    });

    describe('image(16 x 260) with a black pixel in the last row', function () {
        const data = image(16, 260);
        const pixel = (((16 * 259) + 8) * 4);

        data.data[pixel] = 0;
        data.data[pixel + 1] = 0;
        data.data[pixel + 2] = 0;
        data.data[pixel + 3] = 255;

        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', imageMode: 'raster' });
        let result = encoder.image(data, 16, 260).encode();

        /* The height is padded to a multiple of 8, so the image is 264 rows and
           the last chunk has 9 rows, of which the pixel is in the fifth */

        it('should carry the pixel in the second byte of the fifth row of the last chunk', function () {
            const last = RASTER(16, 9);
            last[8 + (4 * 2) + 1] = 128;

            assert.deepEqual(new Uint8Array([ ...RASTER(16, 255), ...last, ...NL ]), result);
        });
    });
});
