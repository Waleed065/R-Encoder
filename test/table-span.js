import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';

/* A cell of a row can span several columns. It is as wide as the columns it
   covers, the margins between them and, in a bordered table, the vertical
   rules it swallows, so a spanned cell behaves exactly like a plain cell of
   that width. The rule rows above and below it connect to the boundary that
   is no longer there with a bottom and a top junction. */

describe('Spanned table cells', function() {
    const NL = [ 10, 13 ];
    const CODEPAGE = [ 27, 116, 0 ];
    const SPACING_NONE = [ 27, 51, 0 ];
    const SPACING_DEFAULT = [ 27, 50 ];

    const spaces = (n) => new Array(n).fill(32);
    const text = (s) => Array.from(s).map((c) => c.charCodeAt(0));
    const line = (n) => new Array(n).fill(0xc4);

    const TOP_LEFT = 0xda;
    const TOP_RIGHT = 0xbf;
    const BOTTOM_LEFT = 0xc0;
    const BOTTOM_RIGHT = 0xd9;
    const VERTICAL = 0xb3;
    const LEFT = 0xc3;
    const RIGHT = 0xb4;
    const TOP = 0xc2;
    const BOTTOM = 0xc1;

    const encode = (fn, options = {}) =>
        fn(new ReceiptPrinterEncoder(Object.assign({ language: 'esc-pos', columns: 32 }, options))).encode();

    describe('a cell spanning two columns with margins in a bordered table', function () {
        let result = encode((e) => e.table(
            [ { width: 6, marginRight: 1 }, { width: 6, marginLeft: 1 } ],
            [ [ 'a', 'b' ], [ { span: 2, content: 'total', align: 'right' } ], [ 'c', 'd' ] ],
            { border: 'single', rules: 'all' },
        ));

        it('should be as wide as the columns, the margins between them and the swallowed rule', function () {
            assert.deepEqual(new Uint8Array([
                ...SPACING_NONE, ...CODEPAGE, TOP_LEFT, ...line(7), TOP, ...line(7), TOP_RIGHT, ...NL,
                VERTICAL, ...text('a'), ...spaces(5), ...spaces(1),
                VERTICAL, ...spaces(1), ...text('b'), ...spaces(5), VERTICAL, ...NL,
                LEFT, ...line(7), BOTTOM, ...line(7), RIGHT, ...NL,
                VERTICAL, ...spaces(10), ...text('total'), VERTICAL, ...NL,
                LEFT, ...line(7), TOP, ...line(7), RIGHT, ...NL,
                VERTICAL, ...text('c'), ...spaces(5), ...spaces(1),
                VERTICAL, ...spaces(1), ...text('d'), ...spaces(5), VERTICAL, ...NL,
                BOTTOM_LEFT, ...line(7), BOTTOM, ...line(7), BOTTOM_RIGHT, ...SPACING_DEFAULT, ...NL,
            ]), result);
        });
    });

    describe('a spanned cell in a bordered table', function () {
        it('should be the same as a plain cell of the computed width', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ { span: 2, content: 'one two three four five' } ] ],
                    { border: 'single' },
                )),
                encode((e) => e.table([ { width: 13 } ], [ [ 'one two three four five' ] ], { border: 'single' })));
        });

        it('should wrap, clip and align like a plain cell of that width', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6, overflow: 'ellipsis', align: 'right' }, { width: 6 } ],
                    [ [ { span: 2, content: 'one two three four five' } ] ],
                    { border: 'single' },
                )),
                encode((e) => e.table(
                    [ { width: 13, overflow: 'ellipsis', align: 'right' } ],
                    [ [ 'one two three four five' ] ],
                    { border: 'single' },
                )));
        });

        it('should take its callback like a plain cell', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6 }, { width: 6 } ],
                    [ [ { span: 2, content: (cell) => cell.bold().text('hi') } ] ],
                    { border: 'single' },
                )),
                encode((e) => e.table(
                    [ { width: 13 } ],
                    [ [ (cell) => cell.bold().text('hi') ] ],
                    { border: 'single' },
                )));
        });
    });

    describe('a spanned cell in a table without a border', function () {
        it('should be as wide as the columns and the margins between them', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...text('a'), ...spaces(5), ...spaces(2), ...text('b'), ...spaces(5), ...NL,
                ...spaces(9), ...text('total'), ...NL,
            ]), encode((e) => e.table(
                [ { width: 6, marginRight: 2 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ { span: 2, content: 'total', align: 'right' } ] ],
            )));
        });
    });

    describe('a span of one', function () {
        it('should be a plain cell with an alignment override', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...spaces(5), ...text('a'), ...text('b'), ...spaces(5), ...NL,
            ]), encode((e) => e.table(
                [ { width: 6, align: 'left' }, { width: 6 } ],
                [ [ { span: 1, content: 'a', align: 'right' }, 'b' ] ],
            )));
        });

        it('should default to the alignment of the column it covers', function () {
            assert.deepEqual(
                encode((e) => e.table([ { width: 6, align: 'right' }, { width: 6 } ], [ [ { content: 'a' }, 'b' ] ])),
                encode((e) => e.table([ { width: 6, align: 'right' }, { width: 6 } ], [ [ 'a', 'b' ] ])));
        });
    });

    describe('the vertical alignment and the overflow of a spanned cell', function () {
        it('should come from the first column it covers', function () {
            assert.deepEqual(
                encode((e) => e.table(
                    [ { width: 6, verticalAlign: 'bottom', overflow: 'clip' }, { width: 6 }, { width: 6 } ],
                    [ [ { span: 2, content: 'one two three four' }, (cell) => cell.text('x\ny\nz') ] ],
                )),
                encode((e) => e.table(
                    [ { width: 12, verticalAlign: 'bottom', overflow: 'clip' }, { width: 6 } ],
                    [ [ 'one two three four', (cell) => cell.text('x\ny\nz') ] ],
                )));
        });
    });

    describe('spans that do not add up to the number of columns', function () {
        it('should throw with the row number when they add up to more', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], [ { span: 2, content: 'x' }, 'y' ] ],
            ))).to.throw('The spans of row 2 do not add up to the number of columns');
        });

        it('should throw with the row number when they add up to less', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 }, { width: 6 }, { width: 6 } ],
                [ [ { span: 2, content: 'x' } ] ],
            ))).to.throw('The spans of row 1 do not add up to the number of columns');
        });

        it('should count a rule row as a row', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ 'a', 'b' ], { rule: true }, [ { span: 3, content: 'x' } ] ],
            ))).to.throw('The spans of row 3 do not add up to the number of columns');
        });

        it('should throw when the span is not a positive integer', function () {
            expect(() => encode((e) => e.table(
                [ { width: 6 }, { width: 6 } ],
                [ [ { span: 0, content: 'x' }, 'y' ] ],
            ))).to.throw('The span of a cell must be a positive integer');
        });
    });

    describe('a row with fewer cells than columns', function () {
        it('should still leave the missing cells empty', function () {
            assert.deepEqual(new Uint8Array([
                ...CODEPAGE, ...text('a'), ...spaces(5), ...spaces(6), ...NL,
            ]), encode((e) => e.table([ { width: 6 }, { width: 6 } ], [ [ 'a' ] ])));
        });
    });
});
