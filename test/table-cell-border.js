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

    describe('a two by two table with the bottom left cell turned off', function () {
        it('should open the frame at the bottom left', function () {
            assert.equal(print((e) => e.table(
                [ { width: 10 }, { width: 11 } ],
                [ [ '', '' ], { rule: true }, [ { content: '', border: 'none' }, '' ] ],
                { outline: 'single', border: 'single' },
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
                { outline: 'single', border: 'single' },
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
            { outline: 'single', border: 'single' },
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
                { outline: 'single', border: 'single' },
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
                { outline: 'single', border: 'single' },
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
                { outline: 'single', border: 'single' },
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
                { outline: 'single', border: 'single' },
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
                { outline: 'single', border: 'single', rules: 'all' },
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
                { outline: 'single', border: 'single', corners: 'rounded' },
            ), { columns: 42 }));
        });
    });

    describe('a plain cell next to a cell without a border', function () {
        it('should keep every side the plain cell wants, and only those', function () {
            assert.equal(print((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', { content: 'b', border: 'none' } ] ],
                { outline: 'single', border: 'single' },
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
                    { outline: 'single', border: 'single' },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { outline: 'single', border: 'single' })));
        });

        it('should be the same as a plain cell per side', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ { content: 'a', border: { top: 'single', left: 'single' } }, 'b' ] ],
                    { outline: 'single', border: 'single' },
                )),
                encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a', 'b' ] ], { outline: 'single', border: 'single' })));
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
                { outline: 'single', border: 'single' },
            ))).to.throw('A cell of row 2 can only turn its border off');
        });

        it('should throw for the other line style on one side', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', border: { top: 'single', bottom: 'double' } } ] ],
                { outline: 'double', border: 'double' },
            ))).to.throw('A cell of row 1 can only turn its border off');
        });

        it('should throw for a value that is not a style at all', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 } ],
                [ [ { content: 'a', border: true } ] ],
                { outline: 'single', border: 'single' },
            ))).to.throw('A cell of row 1 can only turn its border off');
        });
    });

    /* A few hundred random tables, with an independent random style for the
       outline and for the lines between the cells, random borders per cell and
       per side, random margins per column and per cell, checked against the
       rules the drawing has to follow: every printed line is as wide as the
       table, which has a column for a divider only when the table has a border
       and a column for an outer rule only where that side of the outline is
       drawn, every row has a vertical rule exactly at the boundaries one of the
       cells next to it wants, and every glyph of a horizontal line has the
       strokes the cells above and below it ask for, in the style of the line on
       each axis: the style of the horizontal line for its left and right
       strokes, and the style of the vertical rule at that position for its up
       and down strokes. The ownership is worked out here from the cells
       themselves, the glyphs are read from the paper */

    describe('random tables with random styles, borders, outlines and margins', function () {
        /* The strokes of the eleven shapes, and the glyph of every shape for
           every combination of the style of the horizontal and of the vertical
           line that meet in it, in the same order */

        const SHAPES = {
            horizontal: 'lr', vertical: 'ud',
            topLeft: 'dr', topRight: 'dl', bottomLeft: 'ur', bottomRight: 'ul',
            left: 'udr', right: 'udl', top: 'dlr', bottom: 'ulr', middle: 'udlr',
        };

        const SETS = {
            single: { single: '─│┌┐└┘├┤┬┴┼', double: '─║╓╖╙╜╟╢╥╨╫' },
            double: { single: '═│╒╕╘╛╞╡╤╧╪', double: '═║╔╗╚╝╠╣╦╩╬' },
        };

        /* The strokes of every glyph a table can draw, with the style of the
           line each of its axes is part of, which is how a glyph on the paper
           is read back */

        const GLYPH = new Map([ [ ' ', { strokes: '', horizontal: null, vertical: null } ] ]);

        for (const horizontal of Object.keys(SETS)) {
            for (const vertical of Object.keys(SETS[horizontal])) {
                Object.values(SHAPES).forEach((strokes, i) => {
                    const glyph = SETS[horizontal][vertical][i];

                    if (!GLYPH.has(glyph)) {
                        GLYPH.set(glyph, {
                            strokes,
                            horizontal: /[lr]/.test(strokes) ? horizontal : null,
                            vertical: /[ud]/.test(strokes) ? vertical : null,
                        });
                    }
                });
            }
        }

        /* A seeded generator, so that a failing table can be reproduced */

        let seed = 0x9e3779b9;

        const random = (n) => {
            seed = (seed + 0x6d2b79f5) | 0;

            let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

            return ((value ^ (value >>> 14)) >>> 0) % n;
        };

        const style = () => [ 'none', 'single', 'double' ][random(3)];

        /* The outline option, which is a style for every side, an object with
           any of the four sides, where the sides that are left out are none,
           or nothing at all */

        const outline = () => {
            if (random(4) === 0) {
                return undefined;
            }

            if (random(3) === 0) {
                const value = {};

                for (const side of [ 'top', 'right', 'bottom', 'left' ]) {
                    if (random(4) > 0) {
                        value[side] = style();
                    }
                }

                return value;
            }

            return style();
        };

        /* The style of every side of the outline, the sides that are left out
           and an outline that is not there being none */

        const sides = (value) => {
            const result = { top: 'none', right: 'none', bottom: 'none', left: 'none' };

            for (const side of Object.keys(result)) {
                if (typeof value === 'string') {
                    result[side] = value;
                } else if (value !== null && typeof value === 'object' && typeof value[side] !== 'undefined') {
                    result[side] = value[side];
                }
            }

            return result;
        };

        /* The border of a cell, which can only turn a side off: every other
           value it may use is a style the table itself draws with */

        const keep = (styles) => random(2) === 0 || styles.length === 0 ?
            'none' :
            styles[random(styles.length)];

        const border = (styles) => {
            switch (random(4)) {
                case 0:
                    return undefined;
                case 1:
                    return 'none';
                case 2:
                    return { top: keep(styles), right: keep(styles), bottom: keep(styles), left: keep(styles) };
                default:
                    return styles.length === 0 ? undefined : styles[random(styles.length)];
            }
        };

        /* The sides a cell wants, which is every side of a plain cell and of a
           cell of a table that draws no lines at all */

        const wanted = (value, bordered) => {
            const result = { top: true, right: true, bottom: true, left: true };

            for (const side of Object.keys(result)) {
                if (bordered && (value === 'none' ||
                    (typeof value === 'object' && value !== null && value[side] === 'none'))) {
                    result[side] = false;
                }
            }

            return result;
        };

        /* A row of cells, which every now and then spans two columns. The
           margins of a cell override those of the columns it covers and take
           their characters from the contents, so they can never take more
           than the cell has */

        const row = (columns, layout) => {
            const cells = [];
            let c = 0;

            while (c < columns.length) {
                const span = 1 + random(Math.min(2, columns.length - c));
                const cell = { content: String.fromCharCode(97 + c), span, border: border(layout.styles) };

                const room = columns.slice(c, c + span).reduce(
                    (total, column) => total + column.width + column.marginLeft + column.marginRight,
                    layout.inner ? span - 1 : 0);

                const marginLeft = random(3);
                const marginRight = random(3);

                if (random(2) === 0 && marginLeft + marginRight < room) {
                    cell.marginLeft = marginLeft;
                    cell.marginRight = marginRight;
                }

                cells.push(cell);
                c += span;
            }

            return cells;
        };

        /* The positions of the boundaries around every cell of a row, as the
           table works them out: a cell that spans columns swallows the
           dividers between them, and the margins of a cell keep the width of
           the columns it covers. A boundary has a column of its own only where
           the table draws a line, so without the left side of the outline the
           first cell starts at the first character of the table */

        const resolve = (cells, columns, layout) => {
            let position = layout.outline.left !== 'none' ? 0 : -1;
            let column = 0;

            return cells.map((cell, c) => {
                const start = position;

                const total = columns.slice(column, column + cell.span).reduce(
                    (sum, definition) => sum + definition.width + definition.marginLeft + definition.marginRight,
                    layout.inner ? cell.span - 1 : 0);

                const edge = c < cells.length - 1 ? layout.inner : layout.outline.right !== 'none';

                position = start + total + (edge ? 1 : 0);
                column += cell.span;

                return { sides: wanted(cell.border, layout.bordered), start, end: position };
            });
        };

        /* The style of every side of every cell: the outline at the edges of
           the table, the border between the cells, and the style of a rule row
           between two rows, which is single when the table has no dividers */

        const styles = (rows, layout) => {
            for (let r = 0; r < rows.length; r++) {
                const cells = rows[r];

                for (let c = 0; c < cells.length; c++) {
                    const style = {
                        top: r === 0 ? layout.outline.top : layout.rule,
                        right: c === cells.length - 1 ? layout.outline.right : layout.border,
                        bottom: r === rows.length - 1 ? layout.outline.bottom : layout.rule,
                        left: c === 0 ? layout.outline.left : layout.border,
                    };

                    for (const side of Object.keys(style)) {
                        cells[c].sides[side] = cells[c].sides[side] && style[side] !== 'none' ? style[side] : false;
                    }
                }
            }

            return rows;
        };

        /* A vertical rule is drawn at a boundary when the cell on its left
           wants its right side or the cell on its right wants its left side,
           in the style of that side */

        const rules = (cells) => {
            const positions = new Map();

            for (let c = 0; c < cells.length; c++) {
                const left = cells[c].sides.left || (c > 0 && cells[c - 1].sides.right);

                if (left && cells[c].start >= 0) {
                    positions.set(cells[c].start, left);
                }

                if (c === cells.length - 1 && cells[c].sides.right) {
                    positions.set(cells[c].end, cells[c].sides.right);
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

        const segments = (above, below, width) => {
            const positions = new Set();

            for (const [ cells, side ] of [ [ above, 'bottom' ], [ below, 'top' ] ]) {
                for (const cell of cells) {
                    if (cell.sides[side]) {
                        for (let p = Math.max(cell.start, 0); p <= Math.min(cell.end, width - 1); p++) {
                            positions.add(p);
                        }
                    }
                }
            }

            return positions;
        };

        it('should print every line as wide as the table, with the strokes and the styles the cells ask for',
            function () {
                for (let t = 0; t < 400; t++) {
                    const count = 1 + random(4);
                    const columns = new Array(count).fill(0).map(() => ({
                        width: 2 + random(5), marginLeft: random(3), marginRight: random(3),
                    }));

                    const options = {
                        border: style(),
                        rules: random(3) === 0 ? 'all' : 'none',
                        outline: outline(),
                    };

                    /* The lines the table draws: the dividers between the cells
                       in the style of the border, the frame in the style of
                       every side of the outline, and the rule rows in the style
                       of the border, or single when there are no dividers */

                    const edges = sides(options.outline);

                    const layout = {
                        border: options.border,
                        outline: edges,
                        inner: options.border !== 'none',
                        rule: options.border === 'none' ? 'single' : options.border,
                        styles: [ options.border, ...Object.values(edges) ].filter((value) => value !== 'none'),
                    };

                    layout.bordered = layout.inner || layout.styles.length > 0;

                    /* A boundary between two cells has a column of its own only
                       when the table has a border, an outer rule only where
                       that side of the outline is drawn */

                    const width = columns.reduce(
                        (total, column) => total + column.width + column.marginLeft + column.marginRight,
                        (layout.inner ? count - 1 : 0) +
                            (edges.left !== 'none' ? 1 : 0) + (edges.right !== 'none' ? 1 : 0));

                    const data = [];

                    for (let r = 0; r < 1 + random(3); r++) {
                        data.push(row(columns, layout));
                    }

                    const rows = styles(data.map((cells) => resolve(cells, columns, layout)), layout);

                    /* The lines the table is expected to print: the top border,
                       every row, a rule row between every pair of rows when the
                       rules option asks for them, and the bottom border. A
                       horizontal line without a single stroke on it is not
                       printed */

                    const expected = [];

                    const horizontal = (above, below, style) => {
                        const covered = segments(above, below, width);
                        const up = rules(above);
                        const down = rules(below);

                        for (let p = 0; p < width; p++) {
                            if (strokes(up.has(p), down.has(p),
                                covered.has(p - 1) && covered.has(p), covered.has(p) && covered.has(p + 1)) !== '') {
                                expected.push({ up, down, covered, style });
                                return;
                            }
                        }
                    };

                    horizontal([], rows[0], edges.top);

                    for (let r = 0; r < rows.length; r++) {
                        expected.push({ rules: rules(rows[r]) });

                        if (options.rules === 'all' && r < rows.length - 1) {
                            horizontal(rows[r], rows[r + 1], layout.rule);
                        }
                    }

                    horizontal(rows[rows.length - 1], [], edges.bottom);

                    const source = JSON.stringify({ columns, data, options });
                    const result = print((e) => e.table(columns, data, options), { columns: 48 })
                        .split('\n').slice(0, -1);

                    assert.equal(result.length, expected.length, `the number of lines of ${source}`);

                    for (let l = 0; l < result.length; l++) {
                        const line = result[l];

                        assert.equal(line.length, width, `the width of line "${line}" of ${source}`);

                        for (let p = 0; p < width; p++) {
                            const message = `position ${p} of line "${line}" of ${source}`;

                            /* A row has a vertical rule, or a space, at every
                               boundary and its contents everywhere else */

                            if (typeof expected[l].rules !== 'undefined') {
                                const rule = expected[l].rules.get(p) || null;
                                const glyph = GLYPH.get(line[p]);

                                assert.equal(typeof glyph !== 'undefined' && glyph.strokes === 'ud' ?
                                    glyph.vertical : null, rule, `the rule at ${message}`);

                                continue;
                            }

                            const covered = expected[l].covered;
                            const up = expected[l].up.get(p);
                            const down = expected[l].down.get(p);

                            /* Every junction has one style per axis: a vertical
                               rule that runs through a horizontal line has the
                               same style above and below it */

                            if (up && down) {
                                assert.equal(up, down, `the style of the rule at ${message}`);
                            }

                            const expects = strokes(
                                expected[l].up.has(p), expected[l].down.has(p),
                                covered.has(p - 1) && covered.has(p), covered.has(p) && covered.has(p + 1),
                            );

                            const glyph = GLYPH.get(line[p]);

                            assert.isDefined(glyph, `the glyph at ${message}`);
                            assert.equal(glyph.strokes, expects, `the strokes at ${message}`);

                            assert.equal(glyph.horizontal, /[lr]/.test(expects) ? expected[l].style : null,
                                `the horizontal style at ${message}`);

                            assert.equal(glyph.vertical, /[ud]/.test(expects) ? up || down : null,
                                `the vertical style at ${message}`);
                        }
                    }
                }
            });
    });
});
