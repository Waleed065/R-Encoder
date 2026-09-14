import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import { assert, expect } from 'chai';
import { readFileSync } from 'node:fs';

/* markdown() parses a subset of GitHub Flavored Markdown and queues the
   commands that are equal to it. Every construct is defined as a chain of the
   commands the encoder already has, which is what most of the tests below
   check: the same receipt, written in Markdown and written by hand, has to
   produce the same bytes. The remaining tests check the layout of tables and
   lists and the embedded cases as the text that ends up on paper. */

describe('Markdown', function() {
    const encode = (fn, options = {}) =>
        fn(new ReceiptPrinterEncoder(Object.assign({ language: 'esc-pos', columns: 42 }, options))).encode();

    /* The escape sequences of ESC/POS that the tests below can run into, and
       their length in bytes, so that the paper can be read as a string */

    const ESC = { 0x40: 2, 0x45: 3, 0x2d: 3, 0x34: 3, 0x74: 3, 0x33: 3, 0x32: 2, 0x61: 3, 0x4d: 3 };
    const GS = { 0x42: 3, 0x21: 3 };

    const GLYPHS = {
        0xc4: '─', 0xb3: '│', 0xda: '┌', 0xbf: '┐', 0xc0: '└', 0xd9: '┘',
        0xc2: '┬', 0xc1: '┴', 0xc3: '├', 0xb4: '┤', 0xc5: '┼',
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

            if (bytes[i] === 0x1b || bytes[i] === 0x1d) {
                const length = (bytes[i] === 0x1b ? ESC : GS)[bytes[i + 1]];

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

    /* Every construct is equal to a chain of existing commands, on every language */

    const equal = (description, source, chain) => {
        describe(description, function () {
            it('should equal the same chain of commands on esc-pos', function () {
                assert.deepEqual(encode((encoder) => encoder.markdown(source)), encode(chain));
            });

            it('should equal the same chain of commands on star-prnt', function () {
                const options = { language: 'star-prnt', columns: 48 };

                assert.deepEqual(encode((encoder) => encoder.markdown(source), options), encode(chain, options));
            });
        });
    };

    describe('Blocks', function () {
        equal('a first level heading', '# Heading',
            (encoder) => encoder.size(2, 2).bold(true).text('Heading').bold(false).size(1, 1).newline());

        equal('a second level heading', '## Heading',
            (encoder) => encoder.size(1, 2).bold(true).text('Heading').bold(false).size(1, 1).newline());

        equal('a third level heading', '### Heading',
            (encoder) => encoder.bold(true).text('Heading').bold(false).newline());

        equal('a sixth level heading', '###### Heading',
            (encoder) => encoder.bold(true).text('Heading').bold(false).newline());

        equal('a rule of dashes', '---', (encoder) => encoder.rule());
        equal('a rule of asterisks', '***', (encoder) => encoder.rule());
        equal('a rule of underscores', '___', (encoder) => encoder.rule());
        equal('a rule with spaces between its characters', '- - -', (encoder) => encoder.rule());
        equal('a rule of more than three characters', '-----', (encoder) => encoder.rule());

        /* The widest column, Price, takes the space that is left over, so the
           table is as wide as the paper of the encoder it is printed on */

        equal('a pipe table', '| Item | Price |\n|:-----|------:|\n| Beer | 13.00 |',
            (encoder) => encoder.table(
                [
                    { width: 4, align: 'left', marginRight: 1 },
                    { width: encoder.columns - 5, align: 'right', marginRight: 0 },
                ],
                [
                    [ (cell) => cell.bold(true).text('Item').bold(false),
                      (cell) => cell.bold(true).text('Price').bold(false) ],
                    [ (cell) => cell.text('Beer'), (cell) => cell.text('13.00') ],
                ]));

        equal('an unordered list', '- one\n- two',
            (encoder) => encoder.table(
                [ { width: 2 }, {} ],
                [
                    [ '-', (cell) => cell.text('one') ],
                    [ '-', (cell) => cell.text('two') ],
                ]));

        equal('an unordered list with asterisks and plusses', '* one\n+ two',
            (encoder) => encoder.table(
                [ { width: 2 }, {} ],
                [
                    [ '-', (cell) => cell.text('one') ],
                    [ '-', (cell) => cell.text('two') ],
                ]));

        equal('an ordered list', '1. one\n2. two',
            (encoder) => encoder.table(
                [ { width: 3 }, {} ],
                [
                    [ '1.', (cell) => cell.text('one') ],
                    [ '2.', (cell) => cell.text('two') ],
                ]));

        equal('an ordered list with parentheses', '1) one\n2) two',
            (encoder) => encoder.table(
                [ { width: 3 }, {} ],
                [
                    [ '1.', (cell) => cell.text('one') ],
                    [ '2.', (cell) => cell.text('two') ],
                ]));

        equal('a blank line', 'a\n\nb', (encoder) => encoder.line('a').newline().line('b'));

        equal('a line of text', 'Hello world', (encoder) => encoder.text('Hello world').newline());

        equal('two lines of text', 'Hello\nworld', (encoder) => encoder.line('Hello').line('world'));
    });

    describe('Inline', function () {
        equal('bold', '**text**', (encoder) => encoder.bold(true).text('text').bold(false).newline());

        equal('underline', '__text__',
            (encoder) => encoder.underline(true).text('text').underline(false).newline());

        equal('italic with an asterisk', '*text*',
            (encoder) => encoder.italic(true).text('text').italic(false).newline());

        equal('italic with an underscore', '_text_',
            (encoder) => encoder.italic(true).text('text').italic(false).newline());

        equal('invert', '==text==', (encoder) => encoder.invert(true).text('text').invert(false).newline());

        equal('a link', '[text](https://example.com)', (encoder) => encoder.text('text').newline());

        equal('an image', '![alt](image.png)', (encoder) => encoder.text('alt').newline());

        equal('escapes', '\\*\\_\\=\\#\\|\\-\\\\', (encoder) => encoder.text('*_=#|-\\').newline());

        equal('everything else', 'a `code` ~~strike~~ > quote <b>tag</b> &amp;',
            (encoder) => encoder.text('a `code` ~~strike~~ > quote <b>tag</b> &amp;').newline());

        equal('styles in the middle of a line', 'a **b** c',
            (encoder) => encoder.text('a ').bold(true).text('b').bold(false).text(' c').newline());

        equal('nested styles', '**bold and __underlined__**',
            (encoder) => encoder
                .bold(true).text('bold and ')
                .underline(true).text('underlined').underline(false)
                .bold(false)
                .newline());

        equal('a style inside a link', '[**text**](https://example.com)',
            (encoder) => encoder.bold(true).text('text').bold(false).newline());
    });

    describe('Delimiters', function () {
        equal('an asterisk between spaces', 'a * b', (encoder) => encoder.text('a * b').newline());

        equal('an underscore inside a word', 'ORDER_123', (encoder) => encoder.text('ORDER_123').newline());

        equal('an unclosed delimiter', '**unclosed', (encoder) => encoder.text('**unclosed').newline());

        equal('an opener followed by a space', '** not bold**',
            (encoder) => encoder.text('** not bold**').newline());

        equal('a closer preceded by a space', '**not bold **',
            (encoder) => encoder.text('**not bold **').newline());

        equal('an underscore delimiter at a word boundary', 'the _word_ here',
            (encoder) => encoder.text('the ').italic(true).text('word').italic(false).text(' here').newline());

        equal('a style that does not cross a line', '**bold\nnot bold**',
            (encoder) => encoder.text('**bold').newline().text('not bold**').newline());

        equal('a hard break at the end of a line', 'a  \nb\\\nc',
            (encoder) => encoder.line('a').line('b').line('c'));

        equal('a byte order mark at the start of the source', '\ufeff# Heading',
            (encoder) => encoder.size(2, 2).bold(true).text('Heading').bold(false).size(1, 1).newline());
    });

    describe('The current style is the base', function () {
        it('should be a no-op to set a style that is already on', function () {
            assert.deepEqual(
                encode((encoder) => encoder.bold(true).markdown('**bold** and more')),
                encode((encoder) => encoder.bold(true).text('bold and more').newline()));
        });

        it('should restore the style it found, not toggle it', function () {
            assert.deepEqual(
                encode((encoder) => encoder.underline(true).markdown('a __b__ c')),
                encode((encoder) => encoder.underline(true).text('a b c').newline()));
        });

        it('should restore the size it found after a heading', function () {
            assert.deepEqual(
                encode((encoder) => encoder.size(1, 2).markdown('# Heading\ntext')),
                encode((encoder) => encoder
                    .size(1, 2)
                    .size(2, 2).bold(true).text('Heading').bold(false).size(1, 2).newline()
                    .text('text').newline()));
        });
    });

    describe('Tables', function () {
        it('should print the header in bold and align the columns', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| a | bb | ccc |\n|:--|:-:|--:|\n| 1 | 2 | 3 |')),
                lines('a bb' + 'ccc'.padStart(38), '1 2 ' + '3'.padStart(38)));
        });

        it('should not print a header row whose cells are all empty', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| | |\n|-|-|\n| a | b |\n| cc | dd |')),
                lines('a'.padEnd(40) + 'b ', 'cc'.padEnd(40) + 'dd'));
        });

        it('should measure the columns without the markup', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| a | b |\n|---|---|\n| **wide** | x |')),
                lines('a'.padEnd(41) + 'b', 'wide'.padEnd(41) + 'x'));
        });

        it('should print a literal pipe that is escaped', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| a | b |\n|---|---|\n| x \\| y | z |')),
                lines('a'.padEnd(41) + 'b', 'x | y'.padEnd(41) + 'z'));
        });

        it('should add empty cells to a short row and drop the cells of a long one', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| a | b |\n|---|---|\n| x |\n| y | z | q |')),
                lines('a'.padEnd(41) + 'b', 'x'.padEnd(42), 'y'.padEnd(41) + 'z'));
        });

        it('should take the widest column down one character at a time when the columns do not fit', function () {
            const source = `| ${'a'.repeat(30)} | ${'b'.repeat(30)} |\n|---|---|\n| x | y |`;

            assert.equal(
                print((encoder) => encoder.markdown(source)),
                lines(
                    'a'.repeat(20) + ' ' + 'b'.repeat(21),
                    'a'.repeat(10) + ' '.repeat(11) + 'b'.repeat(9) + ' '.repeat(12),
                    'x'.padEnd(20) + ' ' + 'y'.padEnd(21)));
        });

        it('should give the space that is left over to the widest column', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| a | bbb |\n|---|----:|\n| x | y |')),
                lines('a ' + 'bbb'.padStart(40), 'x ' + 'y'.padStart(40)));
        });

        it('should give the space that is left over to the first of the widest columns', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| aa | bb |\n|---|---|\n| x | y |')),
                lines('aa'.padEnd(40) + 'bb', 'x'.padEnd(40) + 'y '));
        });

        it('should leave the columns of a table that had to be reduced as they are', function () {
            const source = `| ${'a'.repeat(40)} | ${'b'.repeat(40)} |\n|---|---|\n| x | y |`;

            assert.equal(
                print((encoder) => encoder.markdown(source)),
                lines(
                    'a'.repeat(20) + ' ' + 'b'.repeat(21),
                    'a'.repeat(20) + ' ' + 'b'.repeat(19) + '  ',
                    'x'.padEnd(20) + ' ' + 'y'.padEnd(21)));
        });

        it('should give the space that is left over inside a cell to the widest column', function () {
            assert.equal(
                print((encoder) => encoder.table(
                    [ { width: 12 }, { width: 30 } ],
                    [ [ (cell) => cell.markdown('| a | bbb |\n|---|---|\n| 1 | 2 |'), 'plain' ] ])),
                lines(
                    'a ' + 'bbb'.padEnd(10) + 'plain'.padEnd(30),
                    '1 ' + '2'.padEnd(10) + ' '.repeat(30)));
        });

        it('should stop at a line without a pipe', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| a |\n|---|\n| x |\nplain')),
                lines('a'.padEnd(42), 'x'.padEnd(42), 'plain'));
        });

        it('should stop at a blank line', function () {
            assert.equal(
                print((encoder) => encoder.markdown('| a |\n|---|\n| x |\n\n| y |')),
                lines('a'.padEnd(42), 'x'.padEnd(42), '', '| y |'));
        });

        it('should measure a cell the way the composer measures it', function () {
            /* An emoji is one character to the composer, so a column with two
               of them is four wide and its rows do not wrap */

            const result = print((encoder) => encoder.markdown('| \u{1f642}\u{1f642} | x |\n|---|---|\n| a | b |'));

            assert.equal(result.split('\n').length - 1, 2);
            assert.equal(result.split('\n')[1], 'a'.padEnd(41) + 'b');
        });

        it('should print the rows as lines of text when not even one character per column fits', function () {
            const header = '| ' + new Array(22).fill('a').join(' | ') + ' |';
            const delimiters = '|' + new Array(22).fill('---').join('|') + '|';
            const row = '| ' + new Array(22).fill('b').join(' | ') + ' |';

            assert.equal(
                print((encoder) => encoder.markdown([ header, delimiters, row ].join('\n'))),
                lines(
                    new Array(21).fill('a').join(' ') + ' ',
                    'a',
                    new Array(21).fill('b').join(' ') + ' ',
                    'b'));
        });

        it('should not throw for a table in a cell that is narrower than its columns', function () {
            assert.equal(
                print((encoder) => encoder.table(
                    [ { width: 4 }, { width: 38 } ],
                    [ [ (cell) => cell.markdown('| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |'), 'x' ] ])),
                lines(
                    'a b ' + 'x'.padEnd(38),
                    'c'.padEnd(42),
                    '1 2 ' + ' '.repeat(38),
                    '3'.padEnd(42)));
        });

        it('should not be a table when the delimiter row does not match the header', function () {
            assert.equal(
                print((encoder) => encoder.markdown('a | b\n---\nc')),
                lines('a | b', '─'.repeat(42), 'c'));
        });
    });

    describe('Lists', function () {
        it('should hang the wrapped lines of an item under its text', function () {
            assert.equal(
                print((encoder) => encoder.markdown('- ' + 'word '.repeat(12))),
                lines(
                    '- word word word word word word word word ',
                    '  word word word word' + ' '.repeat(21)));
        });

        it('should count an ordered list from the number of its first item', function () {
            assert.equal(
                print((encoder) => encoder.markdown('3. one\n1. two\n9. three')),
                lines('3. one'.padEnd(42), '4. two'.padEnd(42), '5. three'.padEnd(42)));
        });

        it('should indent a nested item by two spaces per level, inside the marker column', function () {
            assert.equal(
                print((encoder) => encoder.markdown('- one\n  - two\n    - three\n- four')),
                lines(
                    '-     one'.padEnd(42),
                    '  -   two'.padEnd(42),
                    '    - three'.padEnd(42),
                    '-     four'.padEnd(42)));
        });

        it('should count a nested ordered list on its own', function () {
            assert.equal(
                print((encoder) => encoder.markdown('1. one\n  1. a\n  2. b\n2. two')),
                lines(
                    '1.   one'.padEnd(42),
                    '  1. a'.padEnd(42),
                    '  2. b'.padEnd(42),
                    '2.   two'.padEnd(42)));
        });

        it('should end at a blank line and at a line that is not an item', function () {
            assert.equal(
                print((encoder) => encoder.markdown('- one\n\n- two\nplain')),
                lines('- one'.padEnd(42), '', '- two'.padEnd(42), 'plain'));
        });

        it('should print the items as lines of text when the marker column leaves no room', function () {
            assert.equal(
                print((encoder) => encoder.table(
                    [ { width: 4 }, { width: 38 } ],
                    [ [ (cell) => cell.markdown('- one\n  - two'), 'x' ] ])),
                lines(
                    '-   ' + 'x'.padEnd(38),
                    'one'.padEnd(42),
                    '  - ' + ' '.repeat(38),
                    'two'.padEnd(42)));
        });

        it('should not treat a line that starts with a number as an item', function () {
            assert.equal(
                print((encoder) => encoder.markdown('12 items left')),
                lines('12 items left'));
        });
    });

    describe('The reference receipt', function () {
        const source = readFileSync(new URL('./fixtures/markdown/receipt.md', import.meta.url), 'utf8');

        it('should print the whole dialect on one receipt', function () {
            assert.equal(
                print((encoder) => encoder.markdown(source)),
                lines(
                    'Ichigaya Terminal',
                    '1-Y-X Kudan, Chiyoda-ku',
                    '02-09-2019 19:00',
                    '',
                    '─'.repeat(42),
                    '',
                    'Item'.padEnd(32) + 'Qty  Price',
                    'Beer'.padEnd(34) + '2  13.00',
                    'Chidori'.padEnd(34) + '2 172.80',
                    '',
                    '─'.repeat(42),
                    '',
                    'TOTAL 185.80',
                    'Cash 200.00',
                    'Change 14.20',
                    '',
                    'Notes',
                    '-  Meals and goods at the reduced tax rate',
                    '-  Paid in cash'.padEnd(42),
                    '1. Keep this receipt'.padEnd(42),
                    '2. Visit our site'.padEnd(42),
                    '',
                    'Thank you!'));
        });

        it('should style the headings, the total, the underline and the invert', function () {
            const result = encode((encoder) => encoder.markdown(source));

            /* The heading at double size, bold on and off around TOTAL,
               underline around reduced and invert around Paid */

            expect(Array.from(result).join(',')).to.contain([ 0x1d, 0x21, 0x11 ].join(','));
            expect(Array.from(result).join(',')).to.contain([ 0x1b, 0x45, 0x01 ].join(','));
            expect(Array.from(result).join(',')).to.contain([ 0x1b, 0x2d, 0x01 ].join(','));
            expect(Array.from(result).join(',')).to.contain([ 0x1d, 0x42, 0x01 ].join(','));
        });
    });

    describe('Inside cells and boxes', function () {
        it('should print the same commands inside a cell as a chain inside that cell', function () {
            const columns = [ { width: 20 }, { width: 22 } ];

            assert.deepEqual(
                encode((encoder) => encoder.table(columns, [ [ (cell) => cell.markdown('**bold**'), 'plain' ] ])),
                encode((encoder) => encoder.table(columns, [ [
                    (cell) => cell.bold(true).text('bold').bold(false).newline(), 'plain',
                ] ])));
        });

        it('should print a heading, a paragraph and a rule inside a box', function () {
            assert.equal(
                print((encoder) => encoder.box(
                    { width: 24, border: 'single', paddingLeft: 1, paddingRight: 1 },
                    (box) => box.markdown('## Title\nSome text here\n\n---'))),
                lines(
                    '┌' + '─'.repeat(22) + '┐',
                    '│ Title' + ' '.repeat(15) + ' │',
                    '│ Some text here' + ' '.repeat(6) + ' │',
                    '│ ' + ' '.repeat(20) + ' │',
                    '│ ' + '─'.repeat(20) + ' │',
                    '└' + '─'.repeat(22) + '┘'));
        });

        it('should print a styled cell next to a plain cell', function () {
            assert.equal(
                print((encoder) => encoder.table(
                    [ { width: 20 }, { width: 22 } ],
                    [ [ (cell) => cell.markdown('**bold** and __under__'), 'plain' ] ])),
                lines('bold and under'.padEnd(20) + 'plain'.padEnd(22)));
        });

        it('should print a pipe table inside a cell', function () {
            assert.equal(
                print((encoder) => encoder.table(
                    [ { width: 20 }, { width: 22 } ],
                    [ [ (cell) => cell.markdown('| a | b |\n|---|---|\n| 1 | 2 |'), 'plain' ] ])),
                lines(
                    'a'.padEnd(19) + 'b' + 'plain'.padEnd(22),
                    '1'.padEnd(19) + '2' + ' '.repeat(22)));
        });

        it('should measure a heading inside a cell in the size of that cell', function () {
            assert.equal(
                print((encoder) => encoder.table(
                    [ { width: 20 }, { width: 22 } ],
                    [ [ (cell) => cell.markdown('# Hi'), 'plain' ] ])),

                /* Hi is printed at double size, so it takes four of the twenty
                   columns of the cell and sixteen spaces pad the rest */

                lines('Hi' + ' '.repeat(16) + 'plain'.padEnd(22)));
        });

        it('should keep the border of a bordered cell intact', function () {
            assert.equal(
                print((encoder) => encoder.table(
                    [ { width: 18 }, { width: 18 } ],
                    [ [ (cell) => cell.markdown('**bold**\n- item'), 'plain' ] ],
                    { border: 'single' })),
                lines(
                    '┌' + '─'.repeat(18) + '┬' + '─'.repeat(18) + '┐',
                    '│' + 'bold'.padEnd(18) + '│' + 'plain'.padEnd(18) + '│',
                    '│' + '- item'.padEnd(18) + '│' + ' '.repeat(18) + '│',
                    '└' + '─'.repeat(18) + '┴' + '─'.repeat(18) + '┘'));
        });
    });
});
