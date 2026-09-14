import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* The outline option turns the border around the whole table off, entirely or
   per side, as a mask on the borders the cells asked for. The column of an
   outer rule is only part of the width of the table where the outline is on,
   so a table without an outline is one character narrower on each side and a
   fill column takes those characters. A cell can override the margins of its
   column, which changes the width of its contents, not the width of the row. */

describe('Table outline and margins per cell', function() {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const SPACING_NONE = [ 27, 51, 0 ];
    const SPACING_DEFAULT = [ 27, 50 ];

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

    describe('a table with only the top of the outline turned off', function () {
        it('should keep the sides and the bottom, and print no top border', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { border: 'single', outline: { top: 'none' } },
            )), lines(
                '│a     │b     │',
                '│c     │d     │',
                '└──────┴──────┘',
            ));
        });
    });

    describe('a table with only the left of the outline turned off', function () {
        it('should shift the contents one character to the left', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ 'c', 'd' ] ],
                { border: 'single', outline: { left: 'none' } },
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
                { border: 'single', width: 16, outline: { left: 'none' } },
            )), lines(
                '────────┬──────┐',
                'a       │b     │',
                '────────┴──────┘',
            ));
        });
    });

    describe('a table with only the right of the outline turned off', function () {
        it('should leave the rule at the right edge out', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ] ],
                { border: 'single', outline: { right: 'none' } },
            )), lines(
                '┌──────┬──────',
                '│a     │b     ',
                '└──────┴──────',
            ));
        });
    });

    describe('an outline with the border style of the table', function () {
        it('should be the same as a table without the option', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { border: 'double', outline: 'double' },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { border: 'double' })));
        });

        it('should be the same as a table without the option per side', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { border: 'single', outline: { top: 'single', left: 'single' } },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { border: 'single' })));
        });
    });

    describe('a table without a border', function () {
        it('should ignore the outline', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ 'a', 'b' ] ],
                    { outline: 'none' },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ])));
        });
    });

    describe('an outline that asks for a border instead of turning it off', function () {
        it('should throw for the other line style', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ 'a' ] ], { border: 'single', outline: 'double' },
            ))).to.throw('The outline of a table can only be turned off');
        });

        it('should throw for the other line style on one side', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ 'a' ] ], { border: 'single', outline: { bottom: 'double' } },
            ))).to.throw('The outline of a table can only be turned off');
        });

        it('should throw for a value that is not a style at all', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ], [ [ 'a' ] ], { border: 'single', outline: false },
            ))).to.throw('The outline of a table can only be turned off');
        });
    });

    describe('a cell with margins of its own', function () {
        it('should print its contents inside the margins, with the row as wide as the table', function () {
            assert.equal(print((e) => e.table(
                [ { width: 10 }, { width: 8, align: 'right' } ],
                [ [ 'Beer', '13.00' ], [ { content: 'Total', marginLeft: 2 }, { content: '185.80', marginRight: 2 } ] ],
                { border: 'single' },
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
                { border: 'single' },
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
                { border: 'single' },
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
                { border: 'single' },
            ))).to.throw('The margins of a cell of row 2 leave no room for its contents');
        });

        it('should throw for a margin that is not a number of characters', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', marginRight: -1 } ] ],
                { border: 'single' },
            ))).to.throw('The margins of a cell of row 1 must be zero or a positive integer');
        });

        it('should throw for a margin that is not an integer', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', marginLeft: 1.5 } ] ],
                { border: 'single' },
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
});
