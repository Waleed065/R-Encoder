import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* The line spacing takes effect for the line feed that follows the command,
   which is the feed of the current line when it is called in the middle of a
   line. At the start of a line it is emitted before the alignment padding,
   because it changes how the paper is fed. Bordered boxes and tables print
   without line spacing, so that their vertical lines touch. */

describe('lineSpacing()', function() {
    const NL = [ 10, 13 ];
    const INITIALIZE = [ 27, 64, 28, 46, 27, 77, 0 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const SPACING_NONE = [ 27, 51, 0 ];
    const SPACING_DEFAULT = [ 27, 50 ];
    const BOLD_ON = [ 27, 69, 1 ];
    const BOLD_OFF = [ 27, 69, 0 ];
    const FONT_B = [ 27, 77, 1 ];

    const STAR_CODEPAGE = [ 27, 29, 116, 0 ];
    const STAR_SPACING_NONE = [ 27, 48 ];
    const STAR_SPACING_DEFAULT = [ 27, 122, 1 ];
    const STAR_FLUSH = [ 27, 29, 80, 48, 27, 29, 80, 49 ];

    const spaces = (n) => new Array(n).fill(32);
    const text = (s) => Array.from(s).map((c) => c.charCodeAt(0));
    const repeat = (b, n) => new Array(n).fill(b);

    describe('lineSpacing(none).line(hi).lineSpacing(default) on esc-pos', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.lineSpacing('none').line('hi').lineSpacing('default').encode();

        it('should set the line spacing to zero and restore it', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, ...text('hi'), ...NL,
                ...SPACING_DEFAULT,
            ]), result);
        });
    });

    describe('lineSpacing(none).line(hi).lineSpacing(default) on star-prnt', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'star-prnt', columns: 32 });
        let result = encoder.lineSpacing('none').line('hi').lineSpacing('default').encode();

        it('should set the line spacing to zero and restore it', function () {
            assert.deepEqual(new Uint8Array([
                ...STAR_SPACING_NONE, ...STAR_CODEPAGE, ...text('hi'), ...NL,
                ...STAR_SPACING_DEFAULT,
                ...STAR_FLUSH,
            ]), result);
        });
    });

    describe('lineSpacing() without a line', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.lineSpacing('none').encode();

        it('should be flushed at the end of the receipt, without a newline', function () {
            assert.deepEqual(new Uint8Array([ ...SPACING_NONE ]), result);
        });
    });

    describe('align(center).lineSpacing(none).line(hi)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.align('center').lineSpacing('none').line('hi').encode();

        it('should be emitted before the alignment padding of the line', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, ...spaces(15), ...text('hi'), ...NL,
            ]), result);
        });
    });

    describe('lineSpacing() with an unknown value', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });

        it('should throw', function () {
            expect(() => encoder.lineSpacing('zero')).to.throw('Unknown line spacing');
        });
    });

    describe('lineSpacing().initialize()', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });

        it('should throw, initialize() must be the first command', function () {
            expect(() => encoder.lineSpacing('none').initialize()).to.throw('Initialize must be the first command');
        });
    });

    describe('initialize() after a lineSpacing()', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        encoder.lineSpacing('none').encode();

        let result = encoder.initialize().line('hi').encode();

        it('should reset the line spacing to the default of the printer', function () {
            assert.deepEqual(new Uint8Array([
                ...INITIALIZE, ...CODEPAGE, ...text('hi'), ...NL,
            ]), result);
        });
    });

    describe('a box with a border', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.box({ width: 10, outline: 'single' }, 'hi').encode();

        it('should be wrapped in a line spacing of none and a restore', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...text('hi'), ...spaces(6), 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a box without a border', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.box({ width: 10, outline: 'none' }, 'hi').encode();

        it('should not change the line spacing', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...text('hi'), ...spaces(8), ...NL,
            ]), result);
        });
    });

    describe('a line after a box with a border', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.box({ width: 10, outline: 'single' }, 'hi').line('ok').encode();

        it('should restore the line spacing before its own content', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...text('hi'), ...spaces(6), 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...SPACING_DEFAULT, ...NL,
                ...text('ok'), ...NL,
            ]), result);
        });
    });
    describe('lineSpacing(none).lineSpacing(none).line(hi)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.lineSpacing('none').lineSpacing('none').line('hi').encode();

        it('should send the command once', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, ...text('hi'), ...NL,
            ]), result);
        });
    });

    describe('initialize().lineSpacing(default)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.initialize().lineSpacing('default').line('hi').encode();

        it('should not send a command, the printer is already at the default', function () {
            assert.deepEqual(new Uint8Array([
                ...INITIALIZE, ...CODEPAGE, ...text('hi'), ...NL,
            ]), result);
        });
    });

    describe('lineSpacing() in a table cell or box', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });

        it('should throw', function () {
            expect(() => encoder.box({ width: 10, outline: 'none' }, (box) => box.lineSpacing('none')).encode())
                .to.throw('Changing the line spacing is not supported in table cells or boxes');
        });
    });

    describe('align(center).bold(true).lineSpacing(none).line(hi)', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.align('center').bold(true).lineSpacing('none').line('hi').encode();

        it('should come before the padding, and the style after it', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...spaces(15), ...BOLD_ON, ...CODEPAGE, ...text('hi'), ...BOLD_OFF, ...NL,
            ]), result);
        });
    });

    describe('lineSpacing(none) around a box with a border', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.lineSpacing('none').box({ width: 10, outline: 'single' }, 'x').line('y').encode();

        it('should keep the line spacing of none after the box', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...text('x'), ...spaces(7), 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...NL,
                ...text('y'), ...NL,
            ]), result);
        });
    });

    describe('two boxes with a border, back to back', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .box({ width: 10, outline: 'single' }, 'a')
            .box({ width: 10, outline: 'single' }, 'b')
            .encode();

        it('should restore the line spacing after each of them, they are separate boxes', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...text('a'), ...spaces(7), 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...SPACING_DEFAULT, ...NL,
                ...SPACING_NONE, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...text('b'), ...spaces(7), 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });
    describe('raw().font() before a centered line', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.align('center').raw([ 1, 2, 3 ]).font('B').line('hi').encode();

        it('should keep the font change behind the raw data', function () {
            assert.deepEqual(new Uint8Array([
                ...spaces(20), 1, 2, 3, ...FONT_B, ...CODEPAGE, ...text('hi'), ...NL,
            ]), result);
        });
    });

    describe('bold().font() before a right aligned line', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.align('right').bold(true).font('B').line('hi').encode();

        it('should move the font change in front of the padding and keep the style behind it', function () {
            assert.deepEqual(new Uint8Array([
                ...FONT_B, ...spaces(40), ...BOLD_ON, ...CODEPAGE, ...text('hi'), ...BOLD_OFF, ...NL,
            ]), result);
        });
    });
});
