import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* The layout of a receiptline document comes from the module given in the
   receiptline option, which is @point-of-sale/receiptline. The encoder only
   hands the document to it, so these tests use a stand-in module that records
   what it receives and prints one line, and check the command around it */

describe('receiptline()', function () {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const text = (s) => Array.from(s).map((c) => c.charCodeAt(0));

    const calls = [];

    const module = {
        transform: async (encoder, document, options) => {
            calls.push({ document, options });
            encoder.line(document.trim());
            return encoder;
        },
    };

    describe('receiptline(document) with the module configured', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32, receiptline: module });
        let result;

        before(async function () {
            calls.length = 0;
            result = await encoder.initialize().receiptline('  hello  ', { corners: 'rounded' });
        });

        it('should hand the document and the options to the module', function () {
            assert.deepEqual(calls, [ { document: '  hello  ', options: { corners: 'rounded' } } ]);
        });

        it('should resolve with the encoder, so that commands can follow', function () {
            assert.strictEqual(result, encoder);

            assert.deepEqual(new Uint8Array([
                27, 64, 28, 46, 27, 77, 0,
                ...CODEPAGE, ...text('hello'), ...NL,
                ...text('after'), ...NL,
            ]), result.line('after').encode());
        });
    });

    describe('receiptline(document) without the option', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });

        it('should reject with a message that names the option', async function () {
            let error;

            try {
                await encoder.receiptline('hello');
            } catch (e) {
                error = e;
            }

            expect(error).to.be.an('error');
            expect(error.message).to.include('receiptline option');
        });
    });

    describe('receiptline(document) with an option that is not a module', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32, receiptline: {} });

        it('should reject', async function () {
            let error;

            try {
                await encoder.receiptline('hello');
            } catch (e) {
                error = e;
            }

            expect(error.message).to.include('receiptline option');
        });
    });

    describe('receiptline(document) in a table cell', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32, receiptline: module });

        it('should throw', function () {
            expect(() => encoder.table([ { width: 10 } ], [ [ (cell) => cell.receiptline('hello') ] ]))
                .to.throw('not supported in table cells or boxes');
        });
    });
});
