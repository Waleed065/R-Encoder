import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import ImageData from '@canvas/image-data';
import Dither from 'canvas-dither';
import { thresholdAsync } from '../src/async-image.js';
import { assert } from 'chai';

/* imageAsync() encodes exactly the same bytes as image(). It only gives the
   thread back to the event loop between the chunks of a raster image, so that
   a tall image, such as a raster receipt or a raster report, does not block
   the user interface while it is converted */

describe('imageAsync()', function () {
    const options = { language: 'esc-pos', columns: 48, imageMode: 'raster' };

    const pattern = (image) => {
        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
                if ((x + y) % 7 < 3) {
                    const i = ((y * image.width) + x) * 4;

                    image.data[i] = 0;
                    image.data[i + 1] = 0;
                    image.data[i + 2] = 0;
                }
            }
        }

        return image;
    };

    const encodeSync = (image, size) => {
        const encoder = new ReceiptPrinterEncoder(options);

        encoder.image(image, size);

        return encoder.encode();
    };

    const encodeAsync = async (image, size) => {
        const encoder = new ReceiptPrinterEncoder(options);

        await encoder.imageAsync(image, size);

        return encoder.encode();
    };

    describe('a single chunk raster image', function () {
        const image = pattern(new ImageData(64, 64));

        it('should return a promise', function () {
            const encoder = new ReceiptPrinterEncoder(options);
            const result = encoder.imageAsync(image, { width: 64 });

            assert.instanceOf(result, Promise);

            return result;
        });

        it('should encode the same bytes as image()', async function () {
            assert.deepEqual(encodeSync(image, { width: 64 }), await encodeAsync(image, { width: 64 }));
        });
    });

    describe('a tall raster image spanning several chunks', function () {
        const image = pattern(new ImageData(64, 600));

        it('should encode the same bytes as image()', async function () {
            assert.deepEqual(encodeSync(image, { width: 64 }), await encodeAsync(image, { width: 64 }));
        });

        it('should send the raster in commands of at most 255 rows', async function () {
            const encoder = new ReceiptPrinterEncoder(options);

            await encoder.imageAsync(image, { width: 64 });

            const items = encoder.commands()
                .flatMap((line) => line.commands)
                .filter((item) => item.type === 'image' && item.value === 'raster');

            assert.deepEqual(items.map((item) => item.height), [ 255, 255, 90 ]);

            /* Each command is the eight byte header followed by the packed
               rows, one byte for every eight dots of width */

            assert.deepEqual(items.map((item) => item.payload.length), [ 8 + (8 * 255), 8 + (8 * 255), 8 + (8 * 90) ]);
            assert.isTrue(items.every((item) => item.payload instanceof Uint8Array));
        });
    });

    describe('the event loop during a tall image', function () {
        it('should get a turn before the encoding finishes', async function () {
            const encoder = new ReceiptPrinterEncoder(options);
            let finished = false;

            const pending = encoder.imageAsync(pattern(new ImageData(64, 600)), { width: 64 })
                .then(() => {
                    finished = true;
                });

            /* The encoding always gives the thread back at least once, so a
               callback that is scheduled right after it starts runs before
               it finishes */

            await new Promise((resolve) => setImmediate(resolve));

            assert.isFalse(finished);

            await pending;

            assert.isTrue(finished);
        });
    });

    describe('a language without an asynchronous image encoder', function () {
        it('should fall back to the synchronous encoding of star-prnt', async function () {
            const image = pattern(new ImageData(64, 128));
            const star = { language: 'star-prnt', columns: 48 };

            const sync = new ReceiptPrinterEncoder(star);
            sync.image(image, { width: 64 });

            const asyncEncoder = new ReceiptPrinterEncoder(star);
            await asyncEncoder.imageAsync(image, { width: 64 });

            assert.deepEqual(sync.encode(), asyncEncoder.encode());
        });
    });

    describe('a dithering algorithm that cannot be split in bands', function () {
        it('should encode the same bytes as image() with atkinson', async function () {
            const syncEncoder = new ReceiptPrinterEncoder(options);
            syncEncoder.image(pattern(new ImageData(64, 128)), { width: 64, algorithm: 'atkinson' });

            const asyncEncoder = new ReceiptPrinterEncoder(options);
            await asyncEncoder.imageAsync(pattern(new ImageData(64, 128)), { width: 64, algorithm: 'atkinson' });

            assert.deepEqual(syncEncoder.encode(), asyncEncoder.encode());
        });
    });

    describe('the asynchronous threshold dither', function () {
        it('should match the dither of canvas-dither on random images', async function () {
            for (let round = 0; round < 50; round++) {
                const width = 1 + Math.floor(Math.random() * 40);
                const height = 1 + Math.floor(Math.random() * 40);
                const threshold = Math.floor(Math.random() * 256);

                const expected = new ImageData(width, height);
                const actual = new ImageData(width, height);

                for (let i = 0; i < expected.data.length; i++) {
                    const value = Math.floor(Math.random() * 256);

                    expected.data[i] = value;
                    actual.data[i] = value;
                }

                Dither.threshold(expected, threshold);
                await thresholdAsync(actual, threshold);

                assert.deepEqual(Array.from(expected.data), Array.from(actual.data));
            }
        });
    });
});
