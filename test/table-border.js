import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* A bordered table draws a vertical rule at both edges and at every boundary
   between two cells, and a horizontal line at the top, at the bottom and at
   every rule row. The glyph of a horizontal line follows from the rules of the
   row above and the row below it, so that the junctions connect. The whole
   table is printed without line spacing, so that the vertical rules touch. */

describe('Table borders', function() {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const KATAKANA = [ 27, 116, 1 ];
    const SPACING_NONE = [ 27, 51, 0 ];
    const SPACING_DEFAULT = [ 27, 50 ];
    const HEIGHT2 = [ 29, 33, 1 ];
    const SIZE1 = [ 29, 33, 0 ];
    const SIZE2 = [ 29, 33, 17 ];

    const STAR_SPACING_NONE = [ 27, 48 ];
    const STAR_SPACING_DEFAULT = [ 27, 122, 1 ];
    const STAR_STANDARD = [ 27, 29, 116, 0 ];
    const STAR_CP437 = [ 27, 29, 116, 1 ];
    const STAR_FLUSH = [ 27, 29, 80, 48, 27, 29, 80, 49 ];

    const spaces = (n) => new Array(n).fill(32);
    const text = (s) => Array.from(s).map((c) => c.charCodeAt(0));
    const line = (n) => new Array(n).fill(0xc4);
    const repeat = (b, n) => new Array(n).fill(b);

    const TOP_LEFT = 0xda;
    const TOP_RIGHT = 0xbf;
    const BOTTOM_LEFT = 0xc0;
    const BOTTOM_RIGHT = 0xd9;
    const VERTICAL = 0xb3;
    const LEFT = 0xc3;
    const RIGHT = 0xb4;
    const TOP = 0xc2;
    const BOTTOM = 0xc1;
    const MIDDLE = 0xc5;

    const encode = (fn, options = {}) =>
        fn(new ReceiptPrinterEncoder(Object.assign({ language: 'esc-pos', columns: 32 }, options))).encode();

    describe('a bordered table with one row and one column', function () {
        it('should equal the same content in a box, byte for byte, on esc-pos', function () {
            assert.deepEqual(
                encode((e) => e.table([ { width: 8 } ], [ [ 'hi' ] ], { border: 'single' })),
                encode((e) => e.box({ width: 10, border: 'single', paddingLeft: 0, paddingRight: 0 }, 'hi')));
        });

        it('should equal the same content in a box, byte for byte, on star-prnt', function () {
            assert.deepEqual(
                encode((e) => e.table([ { width: 8 } ], [ [ 'hi' ] ], { border: 'single' }), { language: 'star-prnt', columns: 48 }),
                encode((e) => e.box({ width: 10, border: 'single', paddingLeft: 0, paddingRight: 0 }, 'hi'), { language: 'star-prnt', columns: 48 }));
        });

        it('should equal the same content in a box, byte for byte, on star-line', function () {
            assert.deepEqual(
                encode((e) => e.table([ { width: 8 } ], [ [ 'hi' ] ], { border: 'single' }), { language: 'star-line', columns: 48 }),
                encode((e) => e.box({ width: 10, border: 'single', paddingLeft: 0, paddingRight: 0 }, 'hi'), { language: 'star-line', columns: 48 }));
        });
    });

    describe('a bordered table with two columns and a rule row', function () {
        let result = encode((e) => e.table(
            [ { width: 6 }, { width: 6 } ],
            [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
            { border: 'single' },
        ));

        it('should draw the junctions of the rule row as a left, middle and right junction', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(6), TOP, ...line(6), TOP_RIGHT, ...NL,
                VERTICAL, ...text('a'), ...spaces(5), VERTICAL, ...text('b'), ...spaces(5), VERTICAL, ...NL,
                LEFT, ...line(6), MIDDLE, ...line(6), RIGHT, ...NL,
                VERTICAL, ...text('c'), ...spaces(5), VERTICAL, ...text('d'), ...spaces(5), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(6), BOTTOM, ...line(6), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });

        it('should set the line spacing once at the top border and restore it on the bottom border', function () {
            assert.equal(result.join(',').split(SPACING_NONE.join(',')).length - 1, 1);
            assert.equal(result.join(',').split(SPACING_DEFAULT.join(',')).length - 1, 1);
        });
    });

    describe('rules: all', function () {
        const columns = [ { width: 6 }, { width: 6 } ];

        it('should equal the same table with explicit rule rows', function () {
            assert.deepEqual(
                encode((e) => e.table(columns, [ [ 'a', 'b' ], [ 'c', 'd' ], [ 'e', 'f' ] ], { border: 'single', rules: 'all' })),
                encode((e) => e.table(columns, [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ], { rule: true }, [ 'e', 'f' ] ], { border: 'single' })));
        });

        it('should not double up with explicit rule rows', function () {
            assert.deepEqual(
                encode((e) => e.table(columns, [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ], { border: 'single', rules: 'all' })),
                encode((e) => e.table(columns, [ [ 'a', 'b' ], [ 'c', 'd' ] ], { border: 'single', rules: 'all' })));
        });
    });

    describe('a rule row at the top, at the bottom and doubled', function () {
        const columns = [ { width: 6 }, { width: 6 } ];

        it('should be dropped', function () {
            assert.deepEqual(
                encode((e) => e.table(columns, [
                    { rule: true }, [ 'a', 'b' ], { rule: true }, { rule: true }, [ 'c', 'd' ], { rule: true },
                ], { border: 'single' })),
                encode((e) => e.table(columns, [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ], { border: 'single' })));
        });
    });

    describe('a bordered table with rounded corners on an Epson mapping', function () {
        let result = encode((e) => e.table(
            [ { width: 6 }, { width: 6 } ],
            [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
            { border: 'single', corners: 'rounded' },
        ), { columns: 42 });

        it('should draw the whole table in the Katakana page', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...KATAKANA, 0x9c, ...repeat(0x95, 6), 0x91, ...repeat(0x95, 6), 0x9d, ...NL,
                0x96, ...CODEPAGE, ...text('a'), ...spaces(5), ...KATAKANA, 0x96,
                ...CODEPAGE, ...text('b'), ...spaces(5), ...KATAKANA, 0x96, ...NL,
                0x93, ...repeat(0x95, 6), 0x8f, ...repeat(0x95, 6), 0x92, ...NL,
                0x96, ...CODEPAGE, ...text('c'), ...spaces(5), ...KATAKANA, 0x96,
                ...CODEPAGE, ...text('d'), ...spaces(5), ...KATAKANA, 0x96, ...NL,
                0x9e, ...repeat(0x95, 6), 0x90, ...repeat(0x95, 6), 0x9f, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a double height cell in a bordered table', function () {
        let result = encode((e) => e.table(
            [ { width: 6 }, { width: 6 } ],
            [ [ (cell) => cell.height(2).text('a'), 'b' ] ],
            { border: 'single' },
        ));

        it('should print the vertical rules of that line at double height and nothing else', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(6), TOP, ...line(6), TOP_RIGHT, ...NL,
                ...HEIGHT2, VERTICAL, ...text('a'), ...SIZE1, ...spaces(5),
                ...HEIGHT2, VERTICAL, ...SIZE1, ...text('b'), ...spaces(5),
                ...HEIGHT2, VERTICAL, ...SIZE1, ...NL,
                BOTTOM_LEFT, ...line(6), BOTTOM, ...line(6), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a bordered table that is one character too wide', function () {
        it('should count the border characters and throw', function () {
            expect(() => encode((e) => e.table([ { width: 15 }, { width: 15 } ], [ [ 'a', 'b' ] ], { border: 'single' })))
                .to.throw('Table is too wide');
        });

        it('should not throw without a border', function () {
            expect(() => encode((e) => e.table([ { width: 15 }, { width: 15 } ], [ [ 'a', 'b' ] ])))
                .to.not.throw();
        });
    });

    describe('a fill column in a bordered table', function () {
        it('should take the width of the paper minus the fixed columns and the rules', function () {
            assert.deepEqual(
                encode((e) => e.table([ {}, { width: 8 } ], [ [ 'a', 'b' ] ], { border: 'single' })),
                encode((e) => e.table([ { width: 21 }, { width: 8 } ], [ [ 'a', 'b' ] ], { border: 'single' })));
        });

        it('should fill the width of the table exactly', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(9), TOP, ...line(8), TOP_RIGHT, ...NL,
                VERTICAL, ...text('a'), ...spaces(8), VERTICAL, ...text('b'), ...spaces(7), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(9), BOTTOM, ...line(8), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table([ {}, { width: 8 } ], [ [ 'a', 'b' ] ], { border: 'single', width: 20 })));
        });
    });

    describe('a table with a width larger than the paper', function () {
        it('should throw', function () {
            expect(() => encode((e) => e.table([ { width: 8 } ], [ [ 'a' ] ], { width: 33 })))
                .to.throw('Table is too wide');
        });

        it('should count the width in characters of the current size', function () {
            expect(() => encode((e) => e.size(2).table([ { width: 8 } ], [ [ 'a' ] ], { width: 17 })))
                .to.throw('Table is too wide');
        });

        it('should throw when the width is not a positive integer', function () {
            expect(() => encode((e) => e.table([ { width: 8 } ], [ [ 'a' ] ], { width: 0 })))
                .to.throw('Table width must be a positive integer');
        });
    });

    describe('a centered table with a width', function () {
        it('should be padded like a centered line', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...spaces(6), ...text('a'), ...spaces(9), ...text('b'), ...spaces(9), ...NL,
            ]), encode((e) => e.align('center').table([ { width: 10 }, { width: 10 } ], [ [ 'a', 'b' ] ], { width: 20 })));
        });

        it('should be padded like a centered line with a border', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, ...spaces(6), TOP_LEFT, ...line(9), TOP, ...line(8), TOP_RIGHT, ...NL,
                ...spaces(6), VERTICAL, ...text('a'), ...spaces(8), VERTICAL, ...text('b'), ...spaces(7), VERTICAL, ...NL,
                ...spaces(6), BOTTOM_LEFT, ...line(9), BOTTOM, ...line(8), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.align('center').table([ {}, { width: 8 } ], [ [ 'a', 'b' ] ], { border: 'single', width: 20 })));
        });
    });

    describe('a cell with overflow clip inside a border', function () {
        it('should clip the text at the vertical rule', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(6), TOP, ...line(6), TOP_RIGHT, ...NL,
                VERTICAL, ...text('abcdef'), VERTICAL, ...text('b'), ...spaces(5), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(6), BOTTOM, ...line(6), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(
                [ { width: 6, overflow: 'clip' }, { width: 6 } ],
                [ [ 'abcdefghij', 'b' ] ],
                { border: 'single' },
            )));
        });
    });

    describe('a rule row in a table without a border', function () {
        it('should be a horizontal line over the width of the table', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...text('a'), ...spaces(5), ...text('b'), ...spaces(5), ...NL,
                ...line(12), ...NL,
                ...text('c'), ...spaces(5), ...text('d'), ...spaces(5), ...NL,
            ]), encode((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
            )));
        });

        it('should not change the line spacing', function () {
            const result = encode((e) => e.table([ { width: 6 } ], [ [ 'a' ], { rule: true }, [ 'b' ] ]));

            assert.notInclude(result.join(','), SPACING_NONE.join(','));
        });

        it('should follow the rules option as well', function () {
            assert.deepEqual(
                encode((e) => e.table([ { width: 6 } ], [ [ 'a' ], [ 'b' ] ], { rules: 'all' })),
                encode((e) => e.table([ { width: 6 } ], [ [ 'a' ], { rule: true }, [ 'b' ] ])));
        });

        it('should be drawn with the double line glyph in a double bordered table', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, 0xc9, ...repeat(0xcd, 6), 0xbb, ...NL,
                0xba, ...text('a'), ...spaces(5), 0xba, ...NL,
                0xcc, ...repeat(0xcd, 6), 0xb9, ...NL,
                0xba, ...text('b'), ...spaces(5), 0xba, ...NL,
                0xc8, ...repeat(0xcd, 6), 0xbc, ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table([ { width: 6 } ], [ [ 'a' ], { rule: true }, [ 'b' ] ], { border: 'double' })));
        });
    });

    describe('an unbordered table', function () {
        it('should produce the same bytes as before the options were added', function () {
            assert.deepEqual(
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ])),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { border: 'none' })));
        });
    });

    describe('a bordered table at double size', function () {
        it('should draw the border at double width, with the padding in single width spaces', function () {
            assert.deepEqual(new Uint8Array([
                ...SIZE2, ...SPACING_NONE, ...CODEPAGE,
                TOP_LEFT, ...line(6), TOP, ...line(6), TOP_RIGHT, ...SIZE1, ...NL,
                ...SIZE2, VERTICAL, ...text('a'), ...HEIGHT2, ...spaces(10),
                ...SIZE2, VERTICAL, ...text('b'), ...HEIGHT2, ...spaces(10),
                ...SIZE2, VERTICAL, ...SIZE1, ...NL,
                ...SIZE2, BOTTOM_LEFT, ...line(6), BOTTOM, ...line(6), BOTTOM_RIGHT,
                ...SPACING_DEFAULT, ...SIZE1, ...NL,
            ]), encode((e) => e.size(2).table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { border: 'single' }), { columns: 42 }));
        });

        it('should equal the same content in a box at double size', function () {
            assert.deepEqual(
                encode((e) => e.size(2).table([ { width: 8 } ], [ [ 'hi' ] ], { border: 'single' }), { columns: 42 }),
                encode((e) => e.size(2).box({ width: 10, border: 'single', paddingLeft: 0, paddingRight: 0 }, 'hi'), { columns: 42 }));
        });
    });

    describe('a bordered table with rounded corners on the Star mapping', function () {
        it('should draw the corners in the standard page and the lines and junctions in cp437', function () {
            assert.deepEqual(new Uint8Array([
                ...STAR_SPACING_NONE,
                ...STAR_STANDARD, 0xef, ...STAR_CP437, ...line(4), TOP, ...line(4), ...STAR_STANDARD, 0xff, ...NL,
                ...STAR_CP437, VERTICAL, ...STAR_STANDARD, ...text('a'), ...spaces(3),
                ...STAR_CP437, VERTICAL, ...STAR_STANDARD, ...text('b'), ...spaces(3),
                ...STAR_CP437, VERTICAL, ...NL,
                ...STAR_STANDARD, 0xfd, ...STAR_CP437, ...line(4), BOTTOM, ...line(4), ...STAR_STANDARD, 0xfe,
                ...STAR_SPACING_DEFAULT, ...NL,
                ...STAR_FLUSH,
            ]), encode((e) => e.table(
                [ { width: 4 }, { width: 4 } ],
                [ [ 'a', 'b' ] ],
                { border: 'single', corners: 'rounded' },
            ), { language: 'star-prnt', columns: 48 }));
        });
    });

    describe('a column with verticalAlign bottom inside a border', function () {
        it('should push the shorter cell to the bottom of the row', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(4), TOP, ...line(4), TOP_RIGHT, ...NL,
                VERTICAL, ...spaces(4), VERTICAL, ...text('1'), ...spaces(3), VERTICAL, ...NL,
                VERTICAL, ...spaces(4), VERTICAL, ...text('2'), ...spaces(3), VERTICAL, ...NL,
                VERTICAL, ...text('x'), ...spaces(3), VERTICAL, ...text('3'), ...spaces(3), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(4), BOTTOM, ...line(4), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(
                [ { width: 4, verticalAlign: 'bottom' }, { width: 4 } ],
                [ [ 'x', (cell) => cell.text('1\n2\n3') ] ],
                { border: 'single' },
            )));
        });
    });

    describe('a cell with overflow ellipsis inside a border', function () {
        it('should end the cell with an ellipsis at the vertical rule', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(8), TOP, ...line(6), TOP_RIGHT, ...NL,
                VERTICAL, ...text('Cappu...'), VERTICAL, ...text('b'), ...spaces(5), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(8), BOTTOM, ...line(6), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(
                [ { width: 8, overflow: 'ellipsis' }, { width: 6 } ],
                [ [ 'Cappuccino', 'b' ] ],
                { border: 'single' },
            )));
        });
    });

    describe('a rule row at the top and at the bottom of a table without a border', function () {
        it('should be kept, there is no border they would double up with', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...line(6), ...NL,
                ...text('a'), ...spaces(5), ...NL,
                ...line(6), ...NL,
            ]), encode((e) => e.table([ { width: 6 } ], [ { rule: true }, [ 'a' ], { rule: true } ])));
        });
    });

    describe('a cell that is neither a string, a callback nor an object', function () {
        it('should be an empty cell, as it was before spans were added', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...spaces(6), ...text('b'), ...spaces(5), ...NL,
            ]), encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ [ 'a' ], 'b' ] ])));
        });

        it('should not put the row on the strict span path', function () {
            expect(() => encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ [ 'a' ] ] ])))
                .to.not.throw();
        });
    });

    describe('validation', function () {
        it('should throw for an unknown border', function () {
            expect(() => encode((e) => e.table([ { width: 6 } ], [ [ 'a' ] ], { border: 'dotted' })))
                .to.throw('Unknown border style');
        });

        it('should throw for unknown corners', function () {
            expect(() => encode((e) => e.table([ { width: 6 } ], [ [ 'a' ] ], { corners: 'soft' })))
                .to.throw('Unknown corners');
        });

        it('should throw for unknown rules', function () {
            expect(() => encode((e) => e.table([ { width: 6 } ], [ [ 'a' ] ], { rules: 'some' })))
                .to.throw('Unknown rules');
        });

        it('should throw for a row that is neither an array nor a rule', function () {
            expect(() => encode((e) => e.table([ { width: 6 } ], [ 'a' ])))
                .to.throw('A row must be an array of cells, or an object with rule set to true');
        });

        it('should throw for a rule row that is not { rule: true }', function () {
            expect(() => encode((e) => e.table([ { width: 6 } ], [ [ 'a' ], { rule: false } ])))
                .to.throw('A row must be an array of cells, or an object with rule set to true');
        });
    });
});
