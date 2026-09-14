import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* Boxes and tables nest in every combination. A box with a border prints
   without line spacing and its contents inherit that, so a bordered box inside
   a bordered box sets the line spacing once at the top of the outer box and
   restores it once at the bottom, and every line of the nesting is as wide as
   the box it is in. */

describe('Nesting boxes and tables', function() {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const SPACING_NONE = [ 27, 51, 0 ];
    const SPACING_DEFAULT = [ 27, 50 ];
    const STAR_CP437 = [ 27, 29, 116, 1 ];
    const STAR_STANDARD = [ 27, 29, 116, 0 ];
    const STAR_SPACING_NONE = [ 27, 48 ];
    const STAR_SPACING_DEFAULT = [ 27, 122, 1 ];
    const STAR_FLUSH = [ 27, 29, 80, 48, 27, 29, 80, 49 ];

    const spaces = (n) => new Array(n).fill(32);
    const text = (s) => Array.from(s).map((c) => c.charCodeAt(0));
    const line = (n) => new Array(n).fill(0xc4);

    const TOP_LEFT = 0xda;
    const TOP_RIGHT = 0xbf;
    const BOTTOM_LEFT = 0xc0;
    const BOTTOM_RIGHT = 0xd9;
    const VERTICAL = 0xb3;
    const TOP = 0xc2;
    const BOTTOM = 0xc1;

    describe('a bordered box inside a bordered box', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .box({ width: 20, outline: 'single' }, (box) => box.box({ width: 16, outline: 'single' }, 'hi'))
            .encode();

        it('should set the line spacing once and restore it once', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(18), TOP_RIGHT, ...NL,
                VERTICAL, TOP_LEFT, ...line(14), TOP_RIGHT, ...spaces(2), VERTICAL, ...NL,
                VERTICAL, VERTICAL, ...text('hi'), ...spaces(12), VERTICAL, ...spaces(2), VERTICAL, ...NL,
                VERTICAL, BOTTOM_LEFT, ...line(14), BOTTOM_RIGHT, ...spaces(2), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(18), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a bordered box in a table cell, next to a plain cell', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .table(
                [ { width: 14 }, { width: 16, marginLeft: 2 } ],
                [ [ (cell) => cell.box({ width: 14, outline: 'single' }, 'hi'), 'x' ] ],
            )
            .encode();

        it('should wrap the whole row, with the second cell next to the box', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                TOP_LEFT, ...line(12), TOP_RIGHT, ...spaces(2), ...text('x'), ...spaces(15), ...NL,
                VERTICAL, ...text('hi'), ...spaces(10), VERTICAL, ...spaces(18), ...NL,
                BOTTOM_LEFT, ...line(12), BOTTOM_RIGHT, ...spaces(18), ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a table inside a bordered box', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .box({ width: 20, outline: 'single' }, (box) => box.table(
                [ { width: 8 }, { width: 8, align: 'right' } ],
                [ [ 'a', 'b' ] ],
            ))
            .encode();

        it('should print the table between the vertical lines of the box', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(18), TOP_RIGHT, ...NL,
                VERTICAL, ...text('a'), ...spaces(14), ...text('b'), ...spaces(2), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(18), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a box inside a box, both without a border', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .box({ width: 20, outline: 'none' }, (box) => box.box({ width: 16, outline: 'none' }, 'hi'))
            .encode();

        it('should not change the line spacing', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...text('hi'), ...spaces(18), ...NL,
            ]), result);
        });
    });
    describe('two bordered boxes of unequal height, side by side in a table', function () {
        const cells = [
            (cell) => cell.box({ width: 14, outline: 'single' }, 'a'),
            (cell) => cell.box({ width: 14, outline: 'single' }, 'bbbb bbbb bbbb bbbb'),
        ];

        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder.table([ { width: 14 }, { marginLeft: 2, width: 14 } ], [ cells ]).encode();

        it('should wrap the whole row, not the lines of each box', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                TOP_LEFT, ...line(12), TOP_RIGHT, ...spaces(2), TOP_LEFT, ...line(12), TOP_RIGHT, ...NL,
                VERTICAL, ...text('a'), ...spaces(11), VERTICAL, ...spaces(2),
                VERTICAL, ...text('bbbb bbbb'), ...spaces(3), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(12), BOTTOM_RIGHT, ...spaces(2),
                VERTICAL, ...text('bbbb bbbb'), ...spaces(3), VERTICAL, ...NL,
                ...spaces(16),
                BOTTOM_LEFT, ...line(12), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });

        it('should not restore the line spacing while the taller box is still printing', function () {
            const lines = [];
            let current = [];

            for (let i = 0; i < result.length; i++) {
                if (result[i] === 10 && result[i + 1] === 13) {
                    lines.push(current);
                    current = [];
                    i++;
                    continue;
                }

                current.push(result[i]);
            }

            assert.isFalse(lines[2].includes(27) && lines[2].includes(50));
        });
    });

    describe('two bordered boxes of unequal height on star-prnt', function () {
        const cells = [
            (cell) => cell.box({ width: 14, outline: 'single' }, 'a'),
            (cell) => cell.box({ width: 14, outline: 'single' }, 'bbbb bbbb bbbb bbbb'),
        ];

        let encoder = new ReceiptPrinterEncoder({ language: 'star-prnt', columns: 32 });
        let result = encoder.table([ { width: 14 }, { marginLeft: 2, width: 14 } ], [ cells ]).encode();

        it('should wrap the whole row', function () {
            assert.deepEqual(new Uint8Array([
                ...STAR_SPACING_NONE, ...STAR_CP437,
                TOP_LEFT, ...line(12), TOP_RIGHT, ...spaces(2), TOP_LEFT, ...line(12), TOP_RIGHT, ...NL,
                VERTICAL, ...STAR_STANDARD, ...text('a'), ...spaces(11), ...STAR_CP437, VERTICAL, ...spaces(2),
                VERTICAL, ...STAR_STANDARD, ...text('bbbb bbbb'), ...spaces(3), ...STAR_CP437, VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(12), BOTTOM_RIGHT, ...spaces(2),
                VERTICAL, ...STAR_STANDARD, ...text('bbbb bbbb'), ...spaces(3), ...STAR_CP437, VERTICAL, ...NL,
                ...spaces(16),
                BOTTOM_LEFT, ...line(12), BOTTOM_RIGHT, ...STAR_SPACING_DEFAULT, ...NL,
                ...STAR_FLUSH,
            ]), result);
        });
    });

    describe('a bordered box inside a box without a border', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .box({ width: 20, outline: 'none' }, (box) => box.box({ width: 16, outline: 'single' }, 'hi'))
            .encode();

        it('should wrap the lines of the outer box', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(14), TOP_RIGHT, ...spaces(4), ...NL,
                VERTICAL, ...text('hi'), ...spaces(12), VERTICAL, ...spaces(4), ...NL,
                BOTTOM_LEFT, ...line(14), BOTTOM_RIGHT, ...spaces(4), ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a box, a table, a cell and a bordered box, four levels deep', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .box({ width: 24, outline: 'none' }, (box) => box.table(
                [ { width: 12 }, { width: 12 } ],
                [ [ (cell) => cell.box({ width: 12, outline: 'single' }, 'z'), 'q' ] ],
            ))
            .encode();

        it('should set the line spacing once at the top and restore it once at the end', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                TOP_LEFT, ...line(10), TOP_RIGHT, ...text('q'), ...spaces(11), ...NL,
                VERTICAL, ...text('z'), ...spaces(9), VERTICAL, ...spaces(12), ...NL,
                BOTTOM_LEFT, ...line(10), BOTTOM_RIGHT, ...spaces(12), ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a plain table inside a cell of a plain table', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .table([ { width: 16 }, { width: 16 } ], [ [
                (cell) => cell.table([ { width: 8 }, { width: 8, align: 'right' } ], [ [ 'a', 'b' ] ]),
                'x',
            ] ])
            .encode();

        it('should print the inner table inside the width of the cell', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...text('a'), ...spaces(14), ...text('b'), ...text('x'), ...spaces(15), ...NL,
            ]), result);
        });
    });

    describe('a bordered table inside a cell of a bordered table', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .table([ { width: 14 }, { width: 14 } ], [ [
                (cell) => cell.table([ { width: 5 }, { width: 5 } ], [ [ 'a', 'b' ] ], { outline: 'single', border: 'single' }),
                'x',
            ] ], { outline: 'single', border: 'single' })
            .encode();

        it('should set the line spacing once at the start of the outer table and once at its end', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(14), TOP, ...line(14), TOP_RIGHT, ...NL,
                VERTICAL, TOP_LEFT, ...line(5), TOP, ...line(5), TOP_RIGHT, ...spaces(1),
                VERTICAL, ...text('x'), ...spaces(13), VERTICAL, ...NL,
                VERTICAL, VERTICAL, ...text('a'), ...spaces(4), VERTICAL, ...text('b'), ...spaces(4), VERTICAL,
                ...spaces(1), VERTICAL, ...spaces(14), VERTICAL, ...NL,
                VERTICAL, BOTTOM_LEFT, ...line(5), BOTTOM, ...line(5), BOTTOM_RIGHT, ...spaces(1),
                VERTICAL, ...spaces(14), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(14), BOTTOM, ...line(14), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a bordered table inside a bordered box', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .box({ width: 20, outline: 'single' }, (box) => box.table(
                [ { width: 8 }, { width: 7 } ],
                [ [ 'a', 'b' ] ],
                { outline: 'single', border: 'single' },
            ))
            .encode();

        it('should print the table between the vertical lines of the box', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(18), TOP_RIGHT, ...NL,
                VERTICAL, TOP_LEFT, ...line(8), TOP, ...line(7), TOP_RIGHT, VERTICAL, ...NL,
                VERTICAL, VERTICAL, ...text('a'), ...spaces(7), VERTICAL, ...text('b'), ...spaces(6),
                VERTICAL, VERTICAL, ...NL,
                VERTICAL, BOTTOM_LEFT, ...line(8), BOTTOM, ...line(7), BOTTOM_RIGHT, VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(18), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a bordered box inside a cell of a bordered table', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .table([ { width: 14 }, { width: 14 } ], [ [
                (cell) => cell.box({ width: 10, outline: 'single' }, 'z'),
                'q',
            ] ], { outline: 'single', border: 'single' })
            .encode();

        it('should print the box inside the cell without touching the line spacing itself', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(14), TOP, ...line(14), TOP_RIGHT, ...NL,
                VERTICAL, TOP_LEFT, ...line(8), TOP_RIGHT, ...spaces(4),
                VERTICAL, ...text('q'), ...spaces(13), VERTICAL, ...NL,
                VERTICAL, VERTICAL, ...text('z'), ...spaces(7), VERTICAL, ...spaces(4),
                VERTICAL, ...spaces(14), VERTICAL, ...NL,
                VERTICAL, BOTTOM_LEFT, ...line(8), BOTTOM_RIGHT, ...spaces(4),
                VERTICAL, ...spaces(14), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(14), BOTTOM, ...line(14), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a nested table with a width of its own', function () {
        let encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 });
        let result = encoder
            .table([ { width: 14 }, { width: 14 } ], [ [
                (cell) => cell.table([ {} ], [ [ 'a' ] ], { outline: 'single', border: 'single', width: 8 }),
                'x',
            ] ], { outline: 'single', border: 'single' })
            .encode();

        it('should resolve the width against the cell, not against the paper', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(14), TOP, ...line(14), TOP_RIGHT, ...NL,
                VERTICAL, TOP_LEFT, ...line(6), TOP_RIGHT, ...spaces(6),
                VERTICAL, ...text('x'), ...spaces(13), VERTICAL, ...NL,
                VERTICAL, VERTICAL, ...text('a'), ...spaces(5), VERTICAL, ...spaces(6),
                VERTICAL, ...spaces(14), VERTICAL, ...NL,
                VERTICAL, BOTTOM_LEFT, ...line(6), BOTTOM_RIGHT, ...spaces(6),
                VERTICAL, ...spaces(14), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(14), BOTTOM, ...line(14), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });

        it('should throw when it is wider than the cell', function () {
            expect(() => new ReceiptPrinterEncoder({ language: 'esc-pos', columns: 32 })
                .table([ { width: 14 }, { width: 14 } ], [ [
                    (cell) => cell.table([ {} ], [ [ 'a' ] ], { width: 16 }),
                    'x',
                ] ]).encode()).to.throw('Table is too wide');
        });
    });
});
