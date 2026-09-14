import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* The rounded corners of a box are not in cp437, they come from the code page
   of the printer that has them: the Katakana page of Epson compatible printers,
   which has the straight lines as well, or the standard page of Star printers,
   which has only the corners, so that the lines stay in cp437. A printer
   without such a page draws square corners. */

describe('Rounded corners', function() {
    const NL = [ 10, 13 ];
    const SPACING_NONE = [ 27, 51, 0 ];
    const SPACING_DEFAULT = [ 27, 50 ];
    const CP437 = [ 27, 116, 0 ];
    const KATAKANA = [ 27, 116, 1 ];
    const PAGE0 = [ 27, 116, 0 ];
    const PAGE1 = [ 27, 116, 1 ];
    const PAGE2 = [ 27, 116, 2 ];

    const STAR_SPACING_NONE = [ 27, 48 ];
    const STAR_SPACING_DEFAULT = [ 27, 122, 1 ];
    const STAR_STANDARD = [ 27, 29, 116, 0 ];
    const STAR_CP437 = [ 27, 29, 116, 1 ];
    const STAR_FLUSH = [ 27, 29, 80, 48, 27, 29, 80, 49 ];

    const spaces = (n) => new Array(n).fill(32);
    const text = (s) => Array.from(s).map((c) => c.charCodeAt(0));
    const repeat = (b, n) => new Array(n).fill(b);

    describe('box() with rounded corners on an Epson mapping', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });
        let result = encoder.box({ width: 10, outline: 'single', corners: 'rounded' }, 'hi').encode();

        it('should draw the whole box in the Katakana page', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...KATAKANA, 0x9c, ...repeat(0x95, 8), 0x9d, ...NL,
                0x96, ...CP437, ...text('hi'), ...spaces(6), ...KATAKANA, 0x96, ...NL,
                0x9e, ...repeat(0x95, 8), 0x9f, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('box() with square corners on an Epson mapping', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });
        let result = encoder.box({ width: 10, outline: 'single' }, 'hi').encode();

        it('should draw the box in cp437', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CP437, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...text('hi'), ...spaces(6), 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('box() with rounded corners on the Star mapping', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'star-prnt', columns: 48 });
        let result = encoder.box({ width: 10, outline: 'single', corners: 'rounded' }, 'hi').encode();

        it('should draw the corners in the standard page and the lines in cp437', function () {
            assert.deepEqual(new Uint8Array([
                ...STAR_SPACING_NONE,
                ...STAR_STANDARD, 0xef, ...STAR_CP437, ...repeat(0xc4, 8), ...STAR_STANDARD, 0xff, ...NL,
                ...STAR_CP437, 0xb3, ...STAR_STANDARD, ...text('hi'), ...spaces(6), ...STAR_CP437, 0xb3, ...NL,
                ...STAR_STANDARD, 0xfd, ...STAR_CP437, ...repeat(0xc4, 8), ...STAR_STANDARD, 0xfe,
                ...STAR_SPACING_DEFAULT, ...NL,
                ...STAR_FLUSH,
            ]), result);
        });
    });

    describe('box() with rounded corners on the SUNMI mapping', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', codepageMapping: 'sunmi', columns: 42 });
        let rounded = encoder.box({ width: 10, outline: 'single', corners: 'rounded' }, 'hi').encode();

        let square = new ReceiptPrinterEncoder({ language: 'esc-pos', codepageMapping: 'sunmi', columns: 42 })
            .box({ width: 10, outline: 'single', corners: 'square' }, 'hi').encode();

        it('should silently fall back to square corners', function () {
            assert.deepEqual(square, rounded);
        });
    });

    describe('box() with rounded corners and a double border', function () {
        let rounded = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, outline: 'double', corners: 'rounded' }, 'hi').encode();

        let square = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, outline: 'double' }, 'hi').encode();

        it('should ignore the corners, a double border has no rounded corners', function () {
            assert.deepEqual(square, rounded);
        });
    });

    describe('box() with the style option instead of outline', function () {
        let border = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, outline: 'double' }, 'hi').encode();

        let style = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, style: 'double' }, 'hi').encode();

        it('should produce the same bytes', function () {
            assert.deepEqual(border, style);
        });
    });

    describe('box() with both the outline and the style option', function () {
        let both = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, outline: 'double', style: 'none' }, 'hi').encode();

        let border = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, outline: 'double' }, 'hi').encode();

        it('should use the outline option', function () {
            assert.deepEqual(border, both);
        });
    });

    describe('box() with style: none and no outline option', function () {
        let result = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, style: 'none' }, 'hi').encode();

        it('should still draw no border', function () {
            assert.deepEqual(new Uint8Array([
                ...CP437, ...text('hi'), ...spaces(8), ...NL,
            ]), result);
        });
    });
    describe('box() with rounded corners on an esc-pos printer with the Star mapping', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', codepageMapping: 'star', columns: 42 });
        let result = encoder.box({ width: 10, outline: 'single', corners: 'rounded' }, 'hi').encode();

        it('should take the corners from the Star Katakana page and the lines from cp437', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE,
                ...PAGE1, 0xef, ...PAGE0, ...repeat(0xc4, 8), ...PAGE1, 0xff, ...NL,
                ...PAGE0, 0xb3, ...text('hi'), ...spaces(6), 0xb3, ...NL,
                ...PAGE1, 0xfd, ...PAGE0, ...repeat(0xc4, 8), ...PAGE1, 0xfe, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('box() with rounded corners on star-line', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'star-line', columns: 42 });
        let result = encoder.box({ width: 10, outline: 'single', corners: 'rounded' }, 'hi').encode();

        it('should draw the corners in the standard page and the lines in cp437', function () {
            assert.deepEqual(new Uint8Array([
                ...STAR_SPACING_NONE,
                ...STAR_STANDARD, 0xef, ...STAR_CP437, ...repeat(0xc4, 8), ...STAR_STANDARD, 0xff, ...NL,
                ...STAR_CP437, 0xb3, ...STAR_STANDARD, ...text('hi'), ...spaces(6), ...STAR_CP437, 0xb3, ...NL,
                ...STAR_STANDARD, 0xfd, ...STAR_CP437, ...repeat(0xc4, 8), ...STAR_STANDARD, 0xfe,
                ...STAR_SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('box() with a double border', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });
        let result = encoder.box({ width: 10, outline: 'double' }, 'hi').encode();

        it('should draw the double line glyphs of cp437', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CP437, 0xc9, ...repeat(0xcd, 8), 0xbb, ...NL,
                0xba, ...text('hi'), ...spaces(6), 0xba, ...NL,
                0xc8, ...repeat(0xcd, 8), 0xbc, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('box() on a mapping where cp437 is not the first page', function () {
        let encoder = new ReceiptPrinterEncoder({
            language: 'esc-pos',
            columns: 42,
            codepageMapping: { 'star/standard': 0, 'cp437': 1 },
        });

        let result = encoder.box({ width: 10, outline: 'single', corners: 'rounded' }, 'hi').encode();

        it('should still draw the lines in cp437 and the corners in the page that has them', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE,
                ...PAGE0, 0xef, ...PAGE1, ...repeat(0xc4, 8), ...PAGE0, 0xff, ...NL,
                ...PAGE1, 0xb3, ...text('hi'), ...spaces(6), 0xb3, ...NL,
                ...PAGE0, 0xfd, ...PAGE1, ...repeat(0xc4, 8), ...PAGE0, 0xfe, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('box() on a mapping without cp437', function () {
        let encoder = new ReceiptPrinterEncoder({
            language: 'esc-pos',
            columns: 42,
            codepageMapping: { 'windows1252': 0, 'cp865': 1 },
        });

        let result = encoder.codepage('windows1252').box({ width: 10, outline: 'single' }, 'hi').encode();

        it('should draw the border in the first page that has the glyphs', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...PAGE1, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...PAGE0, ...text('hi'), ...spaces(6), ...PAGE1, 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });

        it('should not print a question mark for a missing glyph', function () {
            assert.isFalse(result.includes(0x3f));
        });
    });

    describe('box() with an unknown outline style', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });

        it('should throw', function () {
            expect(() => encoder.box({ width: 10, outline: 'dotted' }, 'hi')).to.throw('Unknown outline style');
        });
    });

    describe('box() with unknown corners', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });

        it('should throw', function () {
            expect(() => encoder.box({ width: 10, corners: 'curved' }, 'hi')).to.throw('Unknown corners');
        });
    });
    describe('box() on a mapping without any line drawing glyphs', function () {
        let encoder = new ReceiptPrinterEncoder({
            language: 'esc-pos',
            columns: 42,
            codepageMapping: { 'star/standard': 1 },
        });

        let result = encoder.codepage('star/standard').box({ width: 10, outline: 'single' }, 'hi').encode();

        it('should draw the border in ASCII', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...PAGE1, ...text('+--------+'), ...NL,
                ...text('|hi      |'), ...NL,
                ...text('+--------+'), ...SPACING_DEFAULT, ...NL,
            ]), result);
        });

        it('should not print a question mark for a missing glyph', function () {
            assert.isFalse(result.includes(0x3f));
        });
    });

    describe('a code page mapping without the default page of the language', function () {
        let encoder = new ReceiptPrinterEncoder({
            language: 'esc-pos',
            columns: 42,
            codepageMapping: { 'cp850': 2 },
        });

        let result = encoder.box({ width: 10, outline: 'single' }, 'hi').line('ok').encode();

        it('should start on the first page of the mapping, without an explicit codepage()', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...PAGE2, 0xda, ...repeat(0xc4, 8), 0xbf, ...NL,
                0xb3, ...text('hi'), ...spaces(6), 0xb3, ...NL,
                0xc0, ...repeat(0xc4, 8), 0xd9, ...SPACING_DEFAULT, ...NL,
                ...text('ok'), ...NL,
            ]), result);
        });
    });

    describe('box() with a border option', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });

        it('should throw, the option is called outline', function () {
            expect(() => encoder.box({ width: 10, border: 'none' }, 'hi'))
                .to.throw('The border option of a box is called outline');
        });
    });

    describe('an outline option on the constructor', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42, outline: 'single' });
        let result = encoder.box({ width: 10, outline: 'single' }, 'hi').encode();

        let expected = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, outline: 'single' }, 'hi').encode();

        it('should be ignored, the borders are not a setting of the printer', function () {
            assert.deepEqual(expected, result);
        });
    });

    describe('a borders option on the constructor', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42, borders: 'nonsense' });
        let result = encoder.box({ width: 10, outline: 'single' }, 'hi').encode();

        let expected = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 })
            .box({ width: 10, outline: 'single' }, 'hi').encode();

        it('should be ignored, it is only honoured in table cells and boxes', function () {
            assert.deepEqual(expected, result);
        });
    });

    describe('box() with an outline of none and unknown corners', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 42 });

        it('should still throw', function () {
            expect(() => encoder.box({ width: 10, outline: 'none', corners: 'curved' }, 'hi')).to.throw('Unknown corners');
        });
    });
});
