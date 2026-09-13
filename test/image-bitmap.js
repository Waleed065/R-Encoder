import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert } from 'chai';

/* An ImageBitmap, for example from createImageBitmap() in the browser, is
   drawn onto a canvas like an element. Node has neither, so the test fakes
   both: a class with the name the encoder looks for, and a document whose
   canvas records what is drawn and returns a white image */

describe('image() with an ImageBitmap', function () {
    class ImageBitmap {
        constructor(width, height) {
            this.width = width;
            this.height = height;
        }
    }

    const drawn = [];

    const document = {
        createElement: () => ({
            getContext: () => ({
                drawImage: (input, x, y, width, height) => drawn.push([input.constructor.name, x, y, width, height]),
                getImageData: (x, y, width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) }),
            }),
        }),
    };

    before(function () {
        globalThis.document = document;
    });

    after(function () {
        delete globalThis.document;
    });

    it('should draw the bitmap on a canvas at its own size', function () {
        const encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });
        const result = encoder.initialize().image(new ImageBitmap(16, 8)).encode();

        assert.deepEqual(drawn, [ [ 'ImageBitmap', 0, 0, 16, 8 ] ]);
        assert.isAbove(result.length, 0);
    });
});
