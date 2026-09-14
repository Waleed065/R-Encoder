import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* A cell of a bordered table can turn its own border off, entirely or per
   side. An edge is drawn when either of the cells next to it wants it: a
   vertical rule when the cell on its left wants its right side or the cell on
   its right wants its left side, a horizontal segment over the width of a cell
   when that cell wants its bottom side or the cell below it wants its top
   side. A rule that is not drawn keeps its column as a space, so every row
   stays as wide as the table, and a horizontal line that is blank over its
   whole width is not printed at all. */

describe('Borders per table cell', function() {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const KATAKANA = [ 27, 116, 1 ];
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

    describe('a two by two table with the bottom left cell turned off', function () {
        it('should open the frame at the bottom left', function () {
            assert.equal(print((e) => e.table(
                [ { width: 10 }, { width: 11 } ],
                [ [ '', '' ], { rule: true }, [ { content: '', border: 'none' }, '' ] ],
                { border: 'single' },
            )), lines(
                '┌──────────┬───────────┐',
                '│          │           │',
                '└──────────┼───────────┤',
                '           │           │',
                '           └───────────┘',
            ));
        });

        it('should open the frame at the bottom right with the other cell turned off', function () {
            assert.equal(print((e) => e.table(
                [ { width: 10 }, { width: 11 } ],
                [ [ '', '' ], { rule: true }, [ '', { content: '', border: 'none' } ] ],
                { border: 'single' },
            )), lines(
                '┌──────────┬───────────┐',
                '│          │           │',
                '├──────────┼───────────┘',
                '│          │            ',
                '└──────────┘            ',
            ));
        });
    });

    describe('a table with every cell turned off', function () {
        const table = (e) => e.table(
            [ { width: 6 }, { width: 6 } ],
            [
                [ { content: 'a', border: 'none' }, { content: 'b', border: 'none' } ],
                [ { content: 'c', border: 'none' }, { content: 'd', border: 'none' } ],
            ],
            { border: 'single' },
        );

        it('should print the rows with spaces where the rules were and no horizontal lines at all', function () {
            assert.equal(print(table), lines(
                ' a      b      ',
                ' c      d      ',
            ));
        });

        it('should restore the line spacing on the last row, which has no bottom border', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE,
                ...spaces(1), ...text('a'), ...spaces(5), ...spaces(1), ...text('b'), ...spaces(5), ...spaces(1), ...NL,
                ...spaces(1), ...text('c'), ...spaces(5), ...spaces(1), ...text('d'), ...spaces(5), ...spaces(1),
                ...SPACING_DEFAULT, ...NL,
            ]), encode(table));
        });
    });

    describe('a cell with only one side turned off', function () {
        it('should keep the vertical rule and open the line at the left', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ { content: 'a', border: { left: 'none' } }, 'b' ] ],
                { border: 'single' },
            )), lines(
                '───────┬──────┐',
                ' a     │b     │',
                '───────┴──────┘',
            ));
        });

        it('should leave the segment under the cell out with the bottom side off', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ { content: 'a', border: { bottom: 'none' } }, 'b' ] ],
                { border: 'single' },
            )), lines(
                '┌──────┬──────┐',
                '│a     │b     │',
                '       └──────┘',
            ));
        });
    });

    describe('a cell without a border in the middle of three columns', function () {
        it('should keep the rules its neighbours want and open the lines over its own width', function () {
            assert.equal(print((e) => e.table(
                [ { width: 5 }, { width: 5 }, { width: 5 } ],
                [ [ 'a', { content: 'b', border: 'none' }, 'c' ] ],
                { border: 'single' },
            )), lines(
                '┌─────┐     ┌─────┐',
                '│a    │b    │c    │',
                '└─────┘     └─────┘',
            ));
        });
    });

    describe('a spanned cell without a border under two bordered cells', function () {
        it('should keep the segment the cells above own, with the corners at the ends', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], { rule: true }, [ { span: 2, content: 'total', border: 'none' } ] ],
                { border: 'single' },
            )), lines(
                '┌──────┬──────┐',
                '│a     │b     │',
                '└──────┴──────┘',
                ' total         ',
            ));
        });
    });

    describe('rules: all with a cell without a border', function () {
        it('should follow the same ownership on every rule row', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ { content: 'c', border: 'none' }, 'd' ], [ 'e', 'f' ] ],
                { border: 'single', rules: 'all' },
            )), lines(
                '┌──────┬──────┐',
                '│a     │b     │',
                '└──────┼──────┤',
                ' c     │d     │',
                '┌──────┼──────┤',
                '│e     │f     │',
                '└──────┴──────┘',
            ));
        });
    });

    describe('rounded corners with a borderless corner cell', function () {
        it('should move the corner to the next owned position', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...KATAKANA, ...spaces(7), 0x9c, ...repeat(0x95, 6), 0x9d, ...NL,
                ...CODEPAGE, ...spaces(1), ...text('a'), ...spaces(5),
                ...KATAKANA, 0x96, ...CODEPAGE, ...text('b'), ...spaces(5), ...KATAKANA, 0x96, ...NL,
                0x9c, ...repeat(0x95, 6), 0x8f, ...repeat(0x95, 6), 0x92, ...NL,
                0x96, ...CODEPAGE, ...text('c'), ...spaces(5), ...KATAKANA, 0x96,
                ...CODEPAGE, ...text('d'), ...spaces(5), ...KATAKANA, 0x96, ...NL,
                0x9e, ...repeat(0x95, 6), 0x90, ...repeat(0x95, 6), 0x9f, ...SPACING_DEFAULT, ...NL,
            ]), encode((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ { content: 'a', border: 'none' }, 'b' ], { rule: true }, [ 'c', 'd' ] ],
                { border: 'single', corners: 'rounded' },
            ), { columns: 42 }));
        });
    });

    describe('a plain cell next to a cell without a border', function () {
        it('should keep every side the plain cell wants, and only those', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', { content: 'b', border: 'none' } ] ],
                { border: 'single' },
            )), lines(
                '┌──────┐       ',
                '│a     │b      ',
                '└──────┘       ',
            ));
        });
    });

    describe('a cell with the border of the table', function () {
        it('should be the same as a plain cell', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ { content: 'a', border: 'single' }, { content: 'b', border: {} } ] ],
                    { border: 'single' },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { border: 'single' })));
        });

        it('should be the same as a plain cell per side', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ { content: 'a', border: { top: 'single', left: 'single' } }, 'b' ] ],
                    { border: 'single' },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { border: 'single' })));
        });
    });

    describe('a table without a border', function () {
        it('should ignore the property', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ { content: 'a', border: 'double' }, { content: 'b', border: { top: 'dotted' } } ] ],
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ])));
        });
    });

    describe('a cell that asks for a border instead of turning it off', function () {
        it('should throw for the other line style, naming the row', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ 'a' ], [ { content: 'b', border: 'double' } ] ],
                { border: 'single' },
            ))).to.throw('A cell of row 2 can only turn its border off');
        });

        it('should throw for the other line style on one side', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', border: { top: 'single', bottom: 'double' } } ] ],
                { border: 'double' },
            ))).to.throw('A cell of row 1 can only turn its border off');
        });

        it('should throw for a value that is not a style at all', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', border: true } ] ],
                { border: 'single' },
            ))).to.throw('A cell of row 1 can only turn its border off');
        });
    });

    /* A few hundred random tables, with random borders per cell and per side,
       checked against the rules the drawing has to follow: every printed line
       is as wide as the table, every row has a vertical rule exactly at the
       boundaries one of the cells next to it wants, and every glyph of a
       horizontal line has an up and a down stroke where the rows above and
       below it have a rule, and a horizontal stroke exactly where the cells
       above and below own a segment. The ownership is worked out here from
       the cells themselves, the glyphs are read from the paper */

    describe('random tables with random borders per cell', function () {
        const STROKES = {
            ' ': '', '─': 'lr', '│': 'ud', '┌': 'dr', '┐': 'dl', '└': 'ur', '┘': 'ul',
            '├': 'udr', '┤': 'udl', '┬': 'dlr', '┴': 'ulr', '┼': 'udlr',
            '═': 'lr', '║': 'ud', '╔': 'dr', '╗': 'dl', '╚': 'ur', '╝': 'ul',
            '╠': 'udr', '╣': 'udl', '╦': 'dlr', '╩': 'ulr', '╬': 'udlr',
        };

        /* A seeded generator, so that a failing table can be reproduced */

        let seed = 0x9e3779b9;

        const random = (n) => {
            seed = (seed + 0x6d2b79f5) | 0;

            let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

            return ((value ^ (value >>> 14)) >>> 0) % n;
        };

        const side = (style) => random(3) === 0 ? 'none' : style;

        const cell = (content, style) => {
            switch (random(4)) {
                case 0:
                    return content;
                case 1:
                    return { content, border: 'none' };
                case 2:
                    return { content, border: {
                        top: side(style), right: side(style), bottom: side(style), left: side(style),
                    } };
                default:
                    return { content, border: style };
            }
        };

        /* A row of cells, which every now and then spans two columns */

        const row = (columns, style) => {
            const cells = [];
            let c = 0;

            while (c < columns.length) {
                const span = 1 + random(Math.min(2, columns.length - c));
                const value = cell(String.fromCharCode(97 + c), style);

                cells.push(Object.assign(typeof value === 'object' ? value : { content: value }, { span }));
                c += span;
            }

            return cells;
        };

        /* The sides of the border every cell of a row wants, and the positions
           of the boundaries around it, as the table works them out: a cell
           that spans columns swallows the rules between them */

        const resolve = (cells, columns) => {
            let position = 0;
            let column = 0;

            return cells.map((cell) => {
                const sides = { top: true, right: true, bottom: true, left: true };
                const border = cell.border;

                for (const side of Object.keys(sides)) {
                    if (border === 'none' || (typeof border === 'object' && border[side] === 'none')) {
                        sides[side] = false;
                    }
                }

                const start = position;

                for (let c = column; c < column + cell.span; c++) {
                    position += columns[c].width + 1;
                }

                column += cell.span;

                return { sides, start, end: position };
            });
        };

        /* A vertical rule is drawn at a boundary when the cell on its left
           wants its right side or the cell on its right wants its left side */

        const rules = (cells) => {
            const positions = new Set();

            for (let c = 0; c < cells.length; c++) {
                if (cells[c].sides.left || (c > 0 && cells[c - 1].sides.right)) {
                    positions.add(cells[c].start);
                }

                if (c === cells.length - 1 && cells[c].sides.right) {
                    positions.add(cells[c].end);
                }
            }

            return positions;
        };

        /* The strokes of the glyph at a position, from the four directions a
           line runs from it. A position a single line runs into has no glyph
           of its own: a lone vertical is blank, because a rule that simply
           ends needs no glyph, and a lone horizontal is the straight line,
           which is the end of a segment */

        const strokes = (up, down, left, right) => {
            const bits = (up ? 'u' : '') + (down ? 'd' : '') + (left ? 'l' : '') + (right ? 'r' : '');

            return { u: '', d: '', l: 'lr', r: 'lr' }[bits] ?? bits;
        };

        /* A horizontal segment over the width of a cell is drawn when that
           cell wants its bottom side or the cell below it wants its top side */

        const segments = (above, below) => {
            const positions = new Set();

            for (const [cells, side] of [ [ above, 'bottom' ], [ below, 'top' ] ]) {
                for (const cell of cells) {
                    if (cell.sides[side]) {
                        for (let p = cell.start; p <= cell.end; p++) {
                            positions.add(p);
                        }
                    }
                }
            }

            return positions;
        };

        it('should print every line as wide as the table, with the strokes the cells ask for', function () {
            for (let t = 0; t < 400; t++) {
                const count = 1 + random(4);
                const columns = new Array(count).fill(0).map(() => ({ width: 2 + random(5) }));
                const width = columns.reduce((total, column) => total + column.width, count + 1);

                const options = {
                    border: random(2) === 0 ? 'single' : 'double',
                    rules: random(3) === 0 ? 'all' : 'none',
                };

                const data = [];

                for (let r = 0; r < 1 + random(3); r++) {
                    data.push(row(columns, options.border));
                }

                const rows = data.map((cells) => resolve(cells, columns));

                /* The lines the table is expected to print: the top border,
                   every row, a rule row between every pair of rows when the
                   rules option asks for them, and the bottom border. A
                   horizontal line without a single stroke on it is not printed */

                const expected = [];

                const horizontal = (above, below) => {
                    const covered = segments(above, below);
                    const up = rules(above);
                    const down = rules(below);

                    for (let p = 0; p < width; p++) {
                        if (strokes(up.has(p), down.has(p),
                            covered.has(p - 1) && covered.has(p), covered.has(p) && covered.has(p + 1)) !== '') {
                            expected.push({ up, down, covered });
                            return;
                        }
                    }
                };

                horizontal([], rows[0]);

                for (let r = 0; r < rows.length; r++) {
                    expected.push({ rules: rules(rows[r]) });

                    if (options.rules === 'all' && r < rows.length - 1) {
                        horizontal(rows[r], rows[r + 1]);
                    }
                }

                horizontal(rows[rows.length - 1], []);

                const source = JSON.stringify(data);
                const result = print((e) => e.table(columns, data, options)).split('\n').slice(0, -1);

                assert.equal(result.length, expected.length, `the number of lines of ${source}`);

                for (let l = 0; l < result.length; l++) {
                    const line = result[l];

                    assert.equal(line.length, width, `the width of line "${line}" of ${source}`);

                    for (let p = 0; p < width; p++) {
                        const message = `position ${p} of line "${line}" of ${source}`;

                        /* A row has a vertical rule, or a space, at every
                           boundary and its contents everywhere else */

                        if (typeof expected[l].rules !== 'undefined') {
                            assert.equal(STROKES[line[p]] === 'ud', expected[l].rules.has(p), `rule at ${message}`);
                            continue;
                        }

                        const covered = expected[l].covered;

                        assert.equal(STROKES[line[p]], strokes(
                            expected[l].up.has(p), expected[l].down.has(p),
                            covered.has(p - 1) && covered.has(p), covered.has(p) && covered.has(p + 1),
                        ), `the strokes at ${message}`);
                    }
                }
            }
        });
    });
});
