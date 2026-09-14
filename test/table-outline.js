import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import CodepageEncoder from '@point-of-sale/codepage-encoder';
import { assert, expect } from 'chai';

/* The frame around a table and the lines between its cells are two independent
   styles: the outline is the style of every side of the frame, the border the
   style of the vertical dividers and of the rule rows. The column of an outer
   rule is only part of the width of the table where that side of the outline is
   drawn, and the columns of the dividers only when the table has a border, so a
   table without either is that many characters narrower and a fill column takes
   those characters. A cell can override the margins of its column, which
   changes the width of its contents, not the width of the row. */

describe('Table outline and margins per cell', function() {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const KATAKANA = [ 27, 116, 1 ];
    const SPACING_NONE = [ 27, 51, 0 ];
    const SPACING_DEFAULT = [ 27, 50 ];

    const STAR_SPACING_NONE = [ 27, 48 ];
    const STAR_SPACING_DEFAULT = [ 27, 122, 1 ];
    const STAR_STANDARD = [ 27, 29, 116, 0 ];
    const STAR_CP437 = [ 27, 29, 116, 1 ];
    const STAR_FLUSH = [ 27, 29, 80, 48, 27, 29, 80, 49 ];

    const spaces = (n) => new Array(n).fill(32);
    const text = (s) => Array.from(s).map((c) => c.charCodeAt(0));
    const repeat = (b, n) => new Array(n).fill(b);

    const encode = (fn, options = {}) =>
        fn(new ReceiptPrinterEncoder(Object.assign({ language: 'esc-pos', columns: 32 }, options))).encode();

    /* The escape sequences the tests below can run into, and their length in
       bytes, so that the paper can be read as a string */

    const ESC = { 0x74: 3, 0x33: 3, 0x32: 2 };

    const GLYPHS = {
        0xc4: '─', 0xb3: '│', 0xda: '┌', 0xbf: '┐', 0xc0: '└', 0xd9: '┘',
        0xc2: '┬', 0xc1: '┴', 0xc3: '├', 0xb4: '┤', 0xc5: '┼',
        0xcd: '═', 0xba: '║', 0xc9: '╔', 0xbb: '╗', 0xc8: '╚', 0xbc: '╝',
        0xcb: '╦', 0xca: '╩', 0xcc: '╠', 0xb9: '╣', 0xce: '╬',
        0xd5: '╒', 0xb8: '╕', 0xd4: '╘', 0xbe: '╛', 0xc6: '╞', 0xb5: '╡',
        0xd1: '╤', 0xcf: '╧', 0xd8: '╪',
        0xd6: '╓', 0xb7: '╖', 0xd3: '╙', 0xbd: '╜', 0xc7: '╟', 0xb6: '╢',
        0xd2: '╥', 0xd0: '╨', 0xd7: '╫',
    };

    const paper = (bytes) => {
        let result = '';

        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] === 0x0a) {
                result += '\n';

                if (bytes[i + 1] === 0x0d) {
                    i++;
                }

                continue;
            }

            if (bytes[i] === 0x1b) {
                const length = ESC[bytes[i + 1]];

                if (!length) {
                    throw new Error(`Unknown escape sequence ${bytes[i]} ${bytes[i + 1]}`);
                }

                i += length - 1;
                continue;
            }

            result += GLYPHS[bytes[i]] || String.fromCharCode(bytes[i]);
        }

        return result;
    };

    const print = (fn, options = {}) => paper(encode(fn, options));

    const lines = (...values) => values.map((value) => value + '\n').join('');

    describe('a grid without an outline', function () {
        const table = (e) => e.table(
            [ {}, { width: 4, align: 'right' }, { width: 8, align: 'right' } ],
            [ [ 'Item', 'Qty', 'Price' ], [ 'Beer', '2', '13.00' ], [ 'Chidori', '2', '172.80' ] ],
            { border: 'single', rules: 'all', outline: 'none' },
        );

        it('should draw the rules between the cells only, with the fill column taking the outer rules', function () {
            assert.equal(print(table), lines(
                'Item              │ Qty│   Price',
                '──────────────────┼────┼────────',
                'Beer              │   2│   13.00',
                '──────────────────┼────┼────────',
                'Chidori           │   2│  172.80',
            ));
        });

        it('should restore the line spacing on the last row, which is the last line it prints', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                ...text('Item'), ...spaces(14), 0xb3, ...spaces(1), ...text('Qty'), 0xb3,
                ...spaces(3), ...text('Price'), ...NL,
                ...repeat(0xc4, 18), 0xc5, ...repeat(0xc4, 4), 0xc5, ...repeat(0xc4, 8), ...NL,
                ...text('Beer'), ...spaces(14), 0xb3, ...spaces(3), ...text('2'), 0xb3,
                ...spaces(3), ...text('13.00'), ...NL,
                ...repeat(0xc4, 18), 0xc5, ...repeat(0xc4, 4), 0xc5, ...repeat(0xc4, 8), ...NL,
                ...text('Chidori'), ...spaces(11), 0xb3, ...spaces(3), ...text('2'), 0xb3,
                ...spaces(2), ...text('172.80'), ...SPACING_DEFAULT, ...NL,
            ]), encode(table));
        });
    });

    describe('a table with an outline on every side but the top', function () {
        it('should keep the sides and the bottom, and print no top border', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { border: 'single', outline: { right: 'single', bottom: 'single', left: 'single' } },
            )), lines(
                '│a     │b     │',
                '│c     │d     │',
                '└──────┴──────┘',
            ));
        });
    });

    describe('a table with an outline on every side but the left', function () {
        it('should shift the contents one character to the left', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { border: 'single', outline: { top: 'single', right: 'single', bottom: 'single' } },
            )), lines(
                '──────┬──────┐',
                'a     │b     │',
                'c     │d     │',
                '──────┴──────┘',
            ));
        });

        it('should give the character to a fill column', function () {
            assert.equal(print((e) => e.table(
                [ {}, { width: 6 } ],
                [ [ 'a', 'b' ] ],
                { border: 'single', width: 16, outline: { top: 'single', right: 'single', bottom: 'single' } },
            )), lines(
                '────────┬──────┐',
                'a       │b     │',
                '────────┴──────┘',
            ));
        });
    });

    describe('a table with an outline on every side but the right', function () {
        it('should leave the rule at the right edge out', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ] ],
                { border: 'single', outline: { top: 'single', bottom: 'single', left: 'single' } },
            )), lines(
                '┌──────┬──────',
                '│a     │b     ',
                '└──────┴──────',
            ));
        });
    });

    describe('an outline that names every side', function () {
        it('should be the same as the style on its own', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { border: 'double', outline: {
                        top: 'double', right: 'double', bottom: 'double', left: 'double',
                    } },
                )),
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { border: 'double', outline: 'double' })));
        });

        it('should leave the sides it does not name out', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { border: 'single', outline: { top: 'single', left: 'single' } },
                )),
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { border: 'single', outline: {
                        top: 'single', right: 'none', bottom: 'none', left: 'single',
                    } })));
        });
    });

    describe('a table without an outline and without a border', function () {
        it('should be the same as a table without the options', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { outline: 'none' },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ])));
        });
    });

    describe('an outline with a style the encoder does not draw', function () {
        it('should throw for a style that does not exist', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ 'a' ] ], { border: 'single', outline: 'dotted' },
            ))).to.throw('Unknown outline style');
        });

        it('should throw for a style that does not exist on one side', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ 'a' ] ], { border: 'single', outline: { bottom: 'dotted' } },
            ))).to.throw('Unknown outline style');
        });

        it('should throw for a value that is not a style at all', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ 'a' ] ], { border: 'single', outline: false },
            ))).to.throw('Unknown outline style');
        });
    });

    describe('a cell with margins of its own', function () {
        it('should print its contents inside the margins, with the row as wide as the table', function () {
            assert.equal(print((e) => e.table(
                [ { width: 10 }, { width: 8, align: 'right' } ],
                [ [ 'Beer', '13.00' ], [ { content: 'Total', marginLeft: 2 }, { content: '185.80', marginRight: 2 } ] ],
                { outline: 'single', border: 'single' },
            )), lines(
                '┌──────────┬────────┐',
                '│Beer      │   13.00│',
                '│  Total   │185.80  │',
                '└──────────┴────────┘',
            ));
        });

        it('should override the margins of the column', function () {
            assert.equal(print((e) => e.table(
                [ { width: 8, marginLeft: 2, marginRight: 2 } ],
                [ [ 'a' ], [ { content: 'b', marginLeft: 0, marginRight: 0 } ] ],
                { outline: 'single', border: 'single' },
            )), lines(
                '┌────────────┐',
                '│  a         │',
                '│b           │',
                '└────────────┘',
            ));
        });

        it('should work in a table without a border', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ { content: 'a', marginLeft: 2 }, 'b' ] ],
            )), lines(
                '  a   b     ',
            ));
        });
    });

    describe('a spanned cell with margins of its own', function () {
        it('should override its outer margins and keep the margins between the columns', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6, marginLeft: 1, marginRight: 1 }, { width: 6, marginLeft: 1, marginRight: 1 } ],
                [ [ 'a', 'b' ], [ { span: 2, content: 'total', marginLeft: 0, marginRight: 0 } ] ],
                { outline: 'single', border: 'single' },
            )), lines(
                '┌────────┬────────┐',
                '│ a      │ b      │',
                '│total            │',
                '└─────────────────┘',
            ));
        });
    });

    describe('a cell whose margins leave no room for its contents', function () {
        it('should throw, naming the row', function () {
            expect(() => encode((e) => e.table(
                [ { width: 4 } ],
                [ [ 'a' ], [ { content: 'b', marginLeft: 2, marginRight: 2 } ] ],
                { outline: 'single', border: 'single' },
            ))).to.throw('The margins of a cell of row 2 leave no room for its contents');
        });

        it('should throw for a margin that is not a number of characters', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', marginRight: -1 } ] ],
                { outline: 'single', border: 'single' },
            ))).to.throw('The margins of a cell of row 1 must be zero or a positive integer');
        });

        it('should throw for a margin that is not an integer', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', marginLeft: 1.5 } ] ],
                { outline: 'single', border: 'single' },
            ))).to.throw('The margins of a cell of row 1 must be zero or a positive integer');
        });
    });

    describe('a double bordered grid without an outline', function () {
        it('should print the double glyphs of the rules only, and no corners at all', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                ...text('a'), ...spaces(5), 0xba, ...text('b'), ...spaces(5), ...NL,
                ...repeat(0xcd, 6), 0xce, ...repeat(0xcd, 6), ...NL,
                ...text('c'), ...spaces(5), 0xba, ...text('d'), ...spaces(5),
                ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { border: 'double', corners: 'rounded', rules: 'all', outline: 'none' },
            )));
        });
    });

    /* The frame and the lines between the cells have a style of their own, so
       a junction of the two has one style per axis. Everything with a double
       line in it is drawn from cp437, which has the mixed junctions of the DOS
       box drawing set */

    describe('a double outline with single dividers', function () {
        const table = (e) => e.table(
            [ { width: 6 }, { width: 6 } ],
            [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
            { outline: 'double', border: 'single' },
        );

        it('should join the two styles at every junction', function () {
            assert.equal(print(table), lines(
                '╔══════╤══════╗',
                '║a     │b     ║',
                '╟──────┼──────╢',
                '║c     │d     ║',
                '╚══════╧══════╝',
            ));
        });

        it('should draw the whole table in cp437 on an Epson mapping', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                0xc9, ...repeat(0xcd, 6), 0xd1, ...repeat(0xcd, 6), 0xbb, ...NL,
                0xba, ...text('a'), ...spaces(5), 0xb3, ...text('b'), ...spaces(5), 0xba, ...NL,
                0xc7, ...repeat(0xc4, 6), 0xc5, ...repeat(0xc4, 6), 0xb6, ...NL,
                0xba, ...text('c'), ...spaces(5), 0xb3, ...text('d'), ...spaces(5), 0xba, ...NL,
                0xc8, ...repeat(0xcd, 6), 0xcf, ...repeat(0xcd, 6), 0xbc, ...SPACING_DEFAULT, ...NL,
            ]), encode(table, { columns: 42 }));
        });

        it('should draw the lines in cp437 and the contents in the standard page on star-prnt', function () {
            assert.deepEqual(new Uint8Array([
                ...STAR_SPACING_NONE, ...STAR_CP437,
                0xc9, ...repeat(0xcd, 6), 0xd1, ...repeat(0xcd, 6), 0xbb, ...NL,
                0xba, ...STAR_STANDARD, ...text('a'), ...spaces(5), ...STAR_CP437,
                0xb3, ...STAR_STANDARD, ...text('b'), ...spaces(5), ...STAR_CP437, 0xba, ...NL,
                0xc7, ...repeat(0xc4, 6), 0xc5, ...repeat(0xc4, 6), 0xb6, ...NL,
                0xba, ...STAR_STANDARD, ...text('c'), ...spaces(5), ...STAR_CP437,
                0xb3, ...STAR_STANDARD, ...text('d'), ...spaces(5), ...STAR_CP437, 0xba, ...NL,
                0xc8, ...repeat(0xcd, 6), 0xcf, ...repeat(0xcd, 6), 0xbc,
                ...STAR_SPACING_DEFAULT, ...NL, ...STAR_FLUSH,
            ]), encode(table, { language: 'star-prnt', columns: 48 }));
        });
    });

    describe('a single outline with double dividers', function () {
        it('should join the two styles at every junction', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
                { outline: 'single', border: 'double' },
            )), lines(
                '┌──────╥──────┐',
                '│a     ║b     │',
                '╞══════╬══════╡',
                '│c     ║d     │',
                '└──────╨──────┘',
            ));
        });
    });

    describe('an outline without a border', function () {
        it('should draw a frame without dividers, with no column between the cells', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { outline: 'single' },
            )), lines(
                '┌────────────┐',
                '│a     b     │',
                '│c     d     │',
                '└────────────┘',
            ));
        });

        it('should draw the rule rows in single lines, joined to the outline', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
                { outline: 'double' },
            )), lines(
                '╔════════════╗',
                '║a     b     ║',
                '╟────────────╢',
                '║c     d     ║',
                '╚════════════╝',
            ));
        });

        it('should be two horizontal lines with only the top and the bottom', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { outline: { top: 'single', bottom: 'single' } },
            )), lines(
                '────────────',
                'a     b     ',
                'c     d     ',
                '────────────',
            ));
        });
    });

    describe('a border without an outline', function () {
        it('should draw the dividers and the rule rows without a frame', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { border: 'single', rules: 'all' },
            )), lines(
                'a     │b     ',
                '──────┼──────',
                'c     │d     ',
            ));
        });
    });

    describe('rounded corners next to a double line', function () {
        it('should be ignored on a double outline', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { outline: 'double', border: 'single', corners: 'rounded' },
                ), { columns: 42 }),
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { outline: 'double', border: 'single' },
                ), { columns: 42 }));
        });

        it('should be drawn on a single outline next to double dividers', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...KATAKANA,
                0x9c, ...repeat(0x95, 6), ...CODEPAGE, 0xd2, ...KATAKANA, ...repeat(0x95, 6), 0x9d, ...NL,
                0x96, ...CODEPAGE, ...text('a'), ...spaces(5), 0xba, ...text('b'), ...spaces(5),
                ...KATAKANA, 0x96, ...NL,
                ...CODEPAGE, 0xc6, ...repeat(0xcd, 6), 0xce, ...repeat(0xcd, 6), 0xb5, ...NL,
                ...KATAKANA, 0x96, ...CODEPAGE, ...text('c'), ...spaces(5), 0xba, ...text('d'), ...spaces(5),
                ...KATAKANA, 0x96, ...NL,
                0x9e, ...repeat(0x95, 6), ...CODEPAGE, 0xd0, ...KATAKANA, ...repeat(0x95, 6), 0x9f,
                ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
                { outline: 'single', border: 'double', corners: 'rounded' },
            ), { columns: 42 }));
        });
    });

    describe('a cell without a border at a corner of a double outline', function () {
        it('should move the frame to the next owned position, in the style of the line there', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ { content: 'a', border: 'none' }, 'b' ], [ 'c', 'd' ] ],
                { outline: 'double', border: 'single' },
            )), lines(
                '       ╒══════╗',
                ' a     │b     ║',
                '║c     │d     ║',
                '╚══════╧══════╝',
            ));
        });
    });

    describe('a rule row above the first row and below the last one', function () {
        const data = [ { rule: true }, [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ], { rule: true } ];
        const columns = [ { width: 5 }, { width: 5 } ];

        it('should be kept in a table without an outline, there is no line it doubles up with', function () {
            assert.equal(print((e) => e.table(columns, data, { border: 'single' })), lines(
                '─────┬─────',
                'a    │b    ',
                '─────┼─────',
                'c    │d    ',
                '─────┴─────',
            ));
        });

        it('should be kept with an outline on the left and the right only', function () {
            assert.equal(print((e) => e.table(columns, data, {
                border: 'single', outline: { left: 'single', right: 'single' },
            })), lines(
                '┌─────┬─────┐',
                '│a    │b    │',
                '├─────┼─────┤',
                '│c    │d    │',
                '└─────┴─────┘',
            ));
        });

        it('should be dropped where the outline draws that side', function () {
            assert.deepEqual(
                encode((e) => e.table(columns, data, { outline: 'single', border: 'single' })),
                encode((e) => e.table(columns, [ [ 'a', 'b' ], { rule: true }, [ 'c', 'd' ] ],
                    { outline: 'single', border: 'single' })));
        });

        it('should restore the line spacing on a rule row that is the last line of the table', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                ...text('a'), ...spaces(4), 0xb3, ...text('b'), ...spaces(4), ...NL,
                ...repeat(0xc4, 5), 0xc1, ...repeat(0xc4, 5), ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(columns, [ [ 'a', 'b' ], { rule: true } ], { border: 'single' })));
        });

        it('should restore it on the row itself when that rule row is blank', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                ...text('a'), ...spaces(4), ...spaces(1), ...text('b'), ...spaces(4),
                ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(
                columns,
                [ [ { content: 'a', border: 'none' }, { content: 'b', border: 'none' } ], { rule: true } ],
                { border: 'single' })));
        });

        it('should print nothing when every row of the table is a rule row', function () {
            const result = encode((e) => e.table(columns, [ { rule: true } ], { border: 'single' }).line('ok'));

            assert.deepEqual(new Uint8Array([ ...CODEPAGE, ...text('ok'), ...NL ]), result);
        });
    });

    describe('a side of an outline or of a cell that is not a side', function () {
        it('should throw for an unknown side of the outline, naming it', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ 'a' ] ], { border: 'single', outline: { topp: 'single' } },
            ))).to.throw('Unknown outline side topp');
        });

        it('should throw for an unknown side of the border of a cell, naming it', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ { content: 'a', border: { botom: 'none' } } ] ],
                { outline: 'single', border: 'single' },
            ))).to.throw('Unknown border side botom');
        });
    });

    describe('the glyphs of a junction of two styles', function () {
        it('should all encode in cp437', function () {
            for (const [ byte, glyph ] of Object.entries(GLYPHS)) {
                const bytes = CodepageEncoder.encode(glyph, 'cp437');

                assert.equal(bytes.length, 1, `the glyph ${glyph} in cp437`);
                assert.equal(bytes[0], Number(byte), `the byte of the glyph ${glyph} in cp437`);
            }
        });
    });
});
