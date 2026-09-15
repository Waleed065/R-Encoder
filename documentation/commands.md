# ReceiptPrinterEncoder
**Formally known as EscPosEncoder, StarPrntEncoder and ThermalPrinterEncoder**

<br>

Create a set of commands that can be send to any receipt printer that supports ESC/POS, StarLine or StarPRNT.

- [About ReceiptPrinterEncoder](../README.md)
- [Usage and installation](usage.md)
- [Configuration options](configuration.md)
- [Handling text](text.md)
- [Commands for creating receipts](commands.md)
  - [Lifecycle](#lifecycle)
  - [Initialize](#initialize)
  - [Codepage](#codepage)
  - [Text](#text)
  - [Newline](#newline)
  - [Line](#line)
  - [Underline](#underline)
  - [Bold](#bold)
  - [Italic](#italic)
  - [Invert](#invert)
  - [Align](#align)
  - [Font](#font)
  - [Width](#width)
  - [Height](#height)
  - [Size](#size)
  - [Line spacing](#line-spacing)
  - [Table](#table)
  - [Box](#box)
  - [Rule](#rule)
  - [Markdown](#markdown)
  - [ReceiptLine](#receiptline)
  - [Barcode](#barcode)
  - [Qrcode](#qrcode)
  - [PDF417 code](#pdf417-code)
  - [Image](#image)
  - [Pulse](#pulse)
  - [Cut](#cut)
  - [Raw](#raw)
- [Printing receipts](printing.md)
- [Migrating from version 3 to version 4](changes.md)
- [Migrating from version 2 to version 3](changes.md#migrating-from-version-2-to-version-3)

<br>

## Commands for creating receipts

Once you have instantiated your `ReceiptPrinterEncoder` object, you can use it to queue commands for adding content, styling the text, inserting barcodes, images and qrcodes and more. 

When you are done, you can use the `encode()` command to get back your encoded receipt, ready to be send to the printer. See the [lifecycle](#lifecycle) section below for how `initialize()` and `encode()` work together to create one or more receipts.

All commands can be chained, except for `encode()` which will return the result as an Uint8Array which contains all the bytes that need to be send to the printer.

<br>

### Lifecycle

The typical lifecycle of a receipt looks like this:

```js
let encoder = new ReceiptPrinterEncoder();

let receipt = encoder
    .initialize()
    .text('The quick brown fox jumps over the lazy dog')
    .encode();
```

A receipt starts with `initialize()`. It resets the printer and the encoder to a known state, so every receipt starts from the same clean slate. Always call it first, on every receipt, even on a newly created encoder. Technically a fresh encoder already is a clean slate, but only `initialize()` also resets the printer itself — and some printers need it. For example SUNMI built-in printers start in double-byte mode and cannot print single-byte text correctly until they are initialized. After that you queue commands, and when the receipt is complete you call `encode()` to get the bytes to send to the printer.

If you want to send a receipt to the printer in parts, you can call `encode()` multiple times. Each call drains the buffer and returns the commands queued so far. The encoder remembers its state — such as the code page and text styles — so the next chunk continues where the previous one left off:

```js
let header = encoder
    .initialize()
    .codepage('cp866')
    .line('Апельсины')
    .encode();

/* ... send the header to the printer ... */

let body = encoder
    .line('Бананы')        // still cp866, no need to set it again
    .encode();
```

Keep in mind that these chunks are not self-contained: each chunk depends on the printer state left by the previous chunk, so they must be sent to the same printer, in the same order.

When the receipt is done, the next receipt starts with `initialize()` again. It resets both the printer and the encoder, so nothing — code page, styles, font, alignment — leaks from one receipt into the next:

```js
let next = encoder
    .initialize()          // clean slate, cp866 and all styles are forgotten
    .line('A brand new receipt')
    .encode();
```

If you prefer, you can also simply create a new encoder for each receipt — as long as you start it with `initialize()` like any other receipt.

The following commands are available:

<br>

---

<br>

### Initialize

Properly initialize the printer, which means text mode is enabled and settings like code page are set to default. It also resets the encoder itself to a clean slate: no code page, no styles, default font and alignment.

```js
let result = encoder
    .initialize()
    .encode()
```

Use `initialize()` to mark the start of a receipt. It is only allowed as the first command of an encoder, or right after an `encode()`. If there is still unprinted content in the buffer, it throws an error. To reset the printer for another receipt, you do not need to create a new encoder — just call `initialize()` again after the previous receipt was encoded.

<br>

### Codepage

Set the code page of the printer. 

If you specify the code page, it will send a command to the printer to enable that particular code page and from then on it will automatically encode all text string to that code page. 

```js
let result = encoder
    .codepage('cp850')
    .text('Iñtërnâtiônàlizætiøn')
    .codepage('cp851')
    .text('διεθνοποίηση')
    .codepage('cp866')
    .text('интернационализация')
    .encode()
```

Alternatively you can specify `auto` to let this library automatically handle the code page encoding. This functionality depends on having the right `printerModel` or `codepageMapping` set in the configuration options.

```js
let result = encoder
    .codepage('auto')
    .text('Iñtërnâtiônàlizætiøn')
    .text('διεθνοποίηση')
    .text('интернационализация')
    .encode()
```

See the chapter [Handling text](text.md) for more information about code pages.

<br>

### Text

Print a string of text. Word are wrapped automatically at the width specified by the `columns` property set at initialisation. 

Multiple calls to `text()` continue on the same line. A newline character in the text ends the current line, and the text after it, from the same call or a later one, continues on the next line.

```js
let result = encoder
    .text('The quick brown fox jumps over the lazy dog')
    .encode()
```

<br>

### Newline

Move to the beginning of the next line.

```js
let result = encoder
    .newline()
    .encode()
```

Optionally you can provide the number of lines you want to insert. The default is one line.

```js
let result = encoder
    .newline(4)
    .encode()
```

<br>

### Line

Print a line of text. This is similar to the `text()` command, except it will automatically add a `newline()` command.

```js
let result = encoder
    .line('The is the first line')
    .line('And this is the second')
    .encode()
```

This would be equal to:

```js
let result = encoder
    .text('The is the first line')
    .newline()
    .text('And this is the second')
    .newline()
    .encode()
```

<br>

### Underline

Change the text style to underline. 

```js
let result = encoder
    .text('This is ')
    .underline()
    .text('underlined')
    .underline()
    .encode()
```

It will try to remember the current state of the text style. But you can also provide and additional parameter to force the text style to turn on and off.

```js
let result = encoder
    .text('This is ')
    .underline(true)
    .text('bold')
    .underline(false)
    .encode()
```

<br>

### Bold

Change the text style to bold. 

```js
let result = encoder
    .text('This is ')
    .bold()
    .text('bold')
    .bold()
    .encode()
```

It will try to remember the current state of the text style. But you can also provide and additional parameter to force the text style to turn on and off.

```js
let result = encoder
    .text('This is ')
    .bold(true)
    .text('bold')
    .bold(false)
    .encode()
```

<br>

### Italic

Change the text style to italic. 

```js
let result = encoder
    .text('This is ')
    .italic()
    .text('italic')
    .italic()
    .encode()
```

It will try to remember the current state of the text style. But you can also provide and additional parameter to force the text style to turn on and off.

```js
let result = encoder
    .text('This is ')
    .italic(true)
    .text('italic')
    .italic(false)
    .encode()
```

Note: this text style is not supported by most ESC/POS receipt printers and not at all by StarPRNT receipt printers.

<br>

### Invert

Change the style to white text on a black background. 

```js
let result = encoder
    .text('This is ')
    .invert()
    .text('white text on black')
    .invert()
    .encode()
```

It will try to remember the current state of the text style. But you can also provide and additional parameter to force the text style to turn on and off.

```js
let result = encoder
    .text('This is ')
    .invert(true)
    .text('white text on black')
    .invert(false)
    .encode()
```

<br>

### Align

Change the alignment of the text. You can specify the alignment using a parameter which can be either "left", "center" or "right".

```js
let result = encoder
    .align('right')
    .line('This line is aligned to the right')
    .align('center')
    .line('This line is centered')
    .align('left')
    .line('This line is aligned to the left')
    .encode()
```

<br>

### Font

Change the printer font. You can specify the font using the name of the font, such as "A", or "B". Or if the
printer supports more: "C", "D" and so on.

```js
let result = encoder
    .font('B')
    .line('Small text)
    .font('A')
    .line('Normal text)
    .encode()
```

Alternatively you can specify the font by using the dimensions of the font, for example:

```js
let result = encoder
    .font('9x17')
    .line('Small text)
    .font('12x24')
    .line('Normal text)
    .encode()
```

Please keep in mind that not all printers support all sizes. Please take a look at the specifications of your printer to see which fonts are supported. Additionally, not all printers use the same name for the same sizes. On some printers font "B" can be 9x17 pixels, on some other printers it can be 9x24 pixels. But generally font "A" is the larger default, and font "B" is the smaller optional one.

<br>

### Width

Change the text width. You can specify the width using a parameter which can be a number from 1 to 6 for StarPRNT or 1 to 8 for ESC/POS.

```js
let result = encoder
    .width(2)
    .line('A line of text twice as wide')
    .width(3)
    .line('A line of text three times as wide')
    .width(1)
    .line('A line of text with normal width')
    .encode()
```

Not all printers support all widths, it is probably best to not go over 4x at the most just to be safe.

<br>

### Height

Change the text height. You can specify the height using a parameter which can be a number from 1 to 6 for StarPRNT or 1 to 8 for ESC/POS.

```js
let result = encoder
    .height(2)
    .line('A line of text twice as high')
    .height(3)
    .line('A line of text three times as high')
    .height(1)
    .line('A line of text with normal height')
    .encode()
```

Not all printers support all heights, it is probably best to not go over 4x at the most just to be safe.

<br>

### Size

It is also possible to change the width and height at the same time with one command. The first parameter will be the width, the second parameter will be the height.

```js
let result = encoder
    .size(2, 2)
    .line('This text is twice as large as normal text')
    .size(1, 1)
    .encode()
```

If you want to change the width and height to the same value, you call this function with just one parameter to change both at the same time.

```js
let result = encoder
    .size(2)
    .line('This text is twice as large as normal text')
    .size(1)
    .encode()
```

<br>

### Line spacing

Change the line spacing, which is the distance the paper is fed after every line.

- `default`: The default line spacing of the printer
- `none`: No line spacing, the paper is fed by the height of the tallest character on the line and nothing more

With a line spacing of `none` there is no gap between two lines, which is how the vertical lines of two bordered lines are made to touch. Bordered boxes and tables do this by themselves, use the command when you draw borders yourself.

```js
let result = encoder
    .lineSpacing('none')
    .line('│ Lines that touch │')
    .lineSpacing('default')
    .encode()
```

The command takes effect for the line feed that follows it, which is the feed of the current line when you call it in the middle of a line, and it stays in effect until you change it back. It is reset by `initialize()`. It cannot be used inside table cells and boxes, which print with the line spacing of the encoder they are embedded in.

<br>

### Table

Insert a table with multiple columns. The contents of each cell can be a string, or a callback function.

```js
let result = encoder
    .table(
        [
            { marginRight: 2, align: 'left' },
            { width: 10, align: 'right' }
        ], 
        [
            [ 'Item 1', '€ 10,00' ],
            [ 'Item 2', '15,00' ],
            [ 'Item 3', '9,95' ],
            [ 'Item 4', '4,75' ],
            [ 'Item 5', '211,05' ],
            [ '', '='.repeat(10) ],
            [ 'Total', (encoder) => encoder.bold().text('€ 250,75').bold() ],
        ]
    )	
    .encode()
```

The table function takes three parameters, the last one is optional. 

The first parameter is an array of column definitions. Each column can have the folowing properties:

- `width`:  determines the width of the column in characters. The total width of all columns, including margins, must fit on the paper, or on the width of the table when one is given, otherwise an error is thrown. If you leave out the width, or set it to `auto`, the column is a fill column that takes the space that is left, see below.
- `marginLeft` and `marginRight`: set a margin to the left and right of the column. 
- `align`: sets the horizontal alignment of the text in the column and can be `left`, `center` or `right`.
- `verticalAlign`: sets the vertical alignment of the text in the column and can either be `top` or `bottom`.
- `overflow`: what happens with text that does not fit on one line of the cell, either `wrap`, `clip` or `ellipsis`, see below. The default is `wrap`.

The second parameter contains the data and is an array that contains each row. There can be as many rows as you would like.

Each row is an array with a value for each cell. The number of cells in each row should be equal to the number of columns you defined previously. Instead of an array of cells, a row can also be an object with a `rule` property set to `true`, which draws a horizontal rule between the rows around it, see below.

```js
[
    /* Row one, with two columns */
    [ 'Cell one', 'Cell two' ],

    /* A horizontal rule between the two rows */
    { rule: true },

    /* Row two, with two columns */
    [ 'Cell three', 'Cell four' ]
]
```

The value can either be a string or a callback function. It can also be an object with a `content`, a `span`, an `align`, a `border`, a `marginLeft` and a `marginRight` property, which lets one cell span several columns, turn its own border off and override the margins of its column, see below.

If you want to style text inside of a cell, can use the callback function instead. The first parameter of the called function contains the encoder object which you can use to chain additional commands.

Cells inherit the bold, italic, underline and invert styles that are active when the table is created. Changing one of these styles inside a cell only applies to that cell, the other cells keep the inherited style.

```js
[
    /* Row one, with two columns */
    [ 
        'Cell one',
        (encoder) => encoder.bold().text('Cell two').bold()
    ],
]
```

The width of a column is measured in characters of the size that is active when the table is created. Cells inherit that size. When a cell changes the size, the number of characters that fit changes with it: a column with a width of 10 in a table at double size fits 10 double width characters, or 20 single width characters after `size(1)` in the cell. Characters of different sizes can be mixed on the same line, and the padding of a cell is always printed in single width spaces.

```js
[
    [ 
        (encoder) => encoder.size(2).text('Total'),
        (encoder) => encoder.text('€ ').size(2).text('250,75')
    ],
]
```

A table with a total width of 24 characters created at double size takes up 48 columns of paper.

The third parameter is an object with additional configuration options:

- `outline`: The style of the frame around the table, either `none`, `single` or `double`, or an object with any of `top`, `right`, `bottom` and `left` set to one of those, where the sides that are left out are `none`, see below. The default is `none`.
- `border`: The style of the lines between the cells, the vertical dividers and the rule rows, either `none`, `single` or `double`. The default is `none`.
- `corners`: The style of the corners of a single outline, either `square` or `rounded`. The default is `square`.
- `rules`: Whether a horizontal rule is drawn between every pair of rows, either `none` or `all`. The default is `none`.
- `width`: The width of the table in characters, by default the width of the paper.

The frame and the lines between the cells are independent of each other, so `outline: 'single', border: 'single'` is a framed table with dividers, `outline: 'single'` on its own a frame without dividers, and `border: 'single'` on its own dividers without a frame. The `outline`, `corners` and `width` options read the same as the options of `box()` with the same names.

```js
let result = encoder
    .table(
        [
            { width: 16 },
            { width: 4, align: 'right' },
            { width: 8, align: 'right' }
        ], 
        [
            [ 'Item', 'Qty', 'Price' ],
            { rule: true },
            [ 'Beer', '2', '13.00' ],
            [ 'Chidori', '2', '172.80' ],
            { rule: true },
            [ { span: 2, content: 'Total' }, '185.80' ]
        ],
        { outline: 'single', border: 'single', width: 32 }
    )	
    .encode()
```

Which prints:

```
┌────────────────┬────┬────────┐
│Item            │ Qty│   Price│
├────────────────┼────┼────────┤
│Beer            │   2│   13.00│
│Chidori         │   2│  172.80│
├────────────────┴────┼────────┤
│Total                │  185.80│
└─────────────────────┴────────┘
```

#### Fill columns

A column without a `width`, or with a `width` of `auto`, is a fill column. It takes the space that is left on the line after the columns with a fixed width and all margins. That way you do not need to calculate the width of the item column yourself for every paper width:

```js
let result = encoder
    .table(
        [
            { align: 'left' },
            { width: 10, align: 'right' }
        ], 
        [
            [ 'Item 1', '€ 10,00' ],
            [ 'Item 2', '15,00' ],
        ]
    )	
    .encode()
```

On 42 column paper the first column is 32 characters wide, on 48 column paper it is 38 characters wide.

If there are multiple fill columns, the remaining space is divided evenly between them. If the space cannot be divided evenly, the first fill columns get one character more. Every fill column needs at least one character, otherwise an error is thrown, just like a table that is too wide.

The fill column is measured in the same way as a fixed column: in characters of the size that is active when the table is created. At double size, a fill column on 42 column paper next to a column of 6 is 15 characters wide. When the table is created after switching to a smaller font, the fill column takes the extra characters that fit on the line in that font.

#### Overflow

By default the text in a cell is wrapped, so a long product name takes up as many lines as it needs. Receipts often keep every item on one line instead, and cut the name off when it is too long. The `overflow` property of a column controls this:

- `wrap`: the text is wrapped onto as many lines as needed. This is the default.
- `clip`: the text is cut off at the edge of the column.
- `ellipsis`: the text is cut off and the line ends with `...` to show that something is missing.

```js
let result = encoder
    .table(
        [
            { overflow: 'ellipsis', align: 'left' },
            { width: 10, align: 'right' }
        ], 
        [
            [ 'Cappuccino with oat milk, extra large', '4,50' ],
        ]
    )	
    .encode()
```

On 32 column paper this prints `Cappuccino with oat...` followed by the price.

Clipping applies to everything that is added to the cell: when a callback function adds more text after the line is full, it is dropped, styles are kept. A newline in the text still ends the line, and the text after it is clipped in the same way. The text is measured in characters of the size that is active at that point, so the ellipsis takes up three characters in the size of the text that overflows.

#### Borders

The `outline` option draws a frame around the table and the `border` option the lines between its cells: a vertical rule between every two cells and the horizontal line of every rule row. Both are `none`, `single` or `double`, and they are independent of each other, so a framed table with dividers sets them both.

```js
let result = encoder
    .table(
        [
            { width: 10, marginRight: 1 },
            { width: 8, marginLeft: 1, align: 'right' }
        ], 
        [
            [ 'Item', '1.00' ],
            { rule: true },
            [ 'Total', '1.00' ]
        ],
        { outline: 'single', border: 'single' }
    )	
    .encode()
```

Which prints:

```
┌───────────┬─────────┐
│Item       │     1.00│
├───────────┼─────────┤
│Total      │     1.00│
└───────────┴─────────┘
```

The two styles meet at the junctions of the frame and the lines inside it, which are drawn with the glyphs that join a single line to a double one, so `outline: 'double', border: 'single'` prints:

```
╔═══════════╤═════════╗
║Item       │     1.00║
╟───────────┼─────────╢
║Total      │     1.00║
╚═══════════╧═════════╝
```

Every glyph with a double line in it comes from cp437, which every printer the encoder supports has. The `corners` option draws the corners of the frame rounded on the printers that have a code page with the glyphs, exactly like the option of `box()`, and only where both sides that meet in a corner are single.

The margins of a column sit inside the border, between the vertical rule and the contents of the cell.

A table with lines is printed without line spacing, so that the vertical rules of consecutive lines touch and the table is drawn as one unbroken frame, in the same way as a box. The paper is fed by the height of the tallest character on each line, so a line at double height inside a cell stays intact, and the vertical rules of that line are printed at that height. After the bottom border the table restores the line spacing that was active before it.

#### Rule rows

A row of the form `{ rule: true }` is a horizontal rule between the rows around it. It is drawn in the style of the `border` option, and with single lines when there are no dividers between the cells. In a table with lines the rule connects to the vertical rules of the row above and the row below it, so the junctions of the rule show where the cells of both rows begin and end. In a table without any lines it is a horizontal line over the width of the table.

Set the `rules` option to `all` to draw a rule between every pair of rows without writing them out. Rules never double up: a rule row directly after another rule row is dropped, and so is one above the first row when the top of the outline is drawn, or below the last row when the bottom of the outline is drawn, so you can combine the option with rule rows of your own. Where the outline leaves that side out there is no line a rule row doubles up with, so a rule row above the first row or below the last one is drawn.

#### Cells that span columns

A cell can be an object instead of a string or a callback function, which lets it span several columns:

- `content`: the contents of the cell, a string or a callback function, exactly like a plain cell
- `span`: the number of columns the cell covers, starting at its own position in the row. The default is 1.
- `align`: the horizontal alignment of the cell, which overrides the alignment of the column
- `border`: the border of the cell, which can only turn the lines of the table off, see below
- `marginLeft` and `marginRight`: the margins of the cell, which override the margins of the column

```js
[
    [ 'Beer', '2', '13.00' ],
    [ { span: 2, content: 'Total', align: 'right' }, '185.80' ]
]
```

The cell is as wide as the columns it covers, plus the margins between those columns, plus one character for every vertical rule it swallows when the table has a border. Everything else works exactly as it does in a plain cell of that width: the text wraps, clips and aligns in the same way. Its outer margins are the left margin of the first column it covers and the right margin of the last, and its vertical alignment and overflow are those of the first column it covers.

The `marginLeft` and `marginRight` of a cell override the margins of the column it falls in, for that cell only. A cell keeps the total width of the columns it covers, so what its margins take is taken from its contents: a cell with a `marginLeft` of 2 in a column of 10 without margins has 8 characters for its contents, and the row is still as wide as the table. For a cell that spans columns the override applies to its outer margins, the margins between the columns it covers stay as they are. A cell whose margins leave no room at all for its contents throws an error that names the row.

In a table with dividers the rule rows above and below a spanned cell connect to the boundary that is not there, with a `┴` above it and a `┬` below it.

As soon as one cell of a row has a span, the spans of that row have to add up to the number of columns exactly, otherwise an error is thrown that names the row.

#### Cells without a border

A cell of a table with lines can turn its own border off, entirely or per side, with the `border` property of the object form:

```js
{ content: 'Total', span: 2, border: 'none' }                  // no border on any side
{ content: 'Total', border: { left: 'none', bottom: 'none' } } // the sides that are left out keep the lines of the table
```

The values a cell may use are `none` and the styles the table itself draws with, which are the style of its border and the styles of the sides of its outline. A cell can only turn its border off: any other value throws an error that names the row, because the line at a side of a cell is the line of the table there. A plain cell, a string or a callback function, has the lines of the table on every side, and a table without any lines ignores the property.

An edge is drawn when the table draws a line there and either of the cells next to it wants it. A vertical rule at a boundary is drawn when the cell on its left wants its right side or the cell on its right wants its left side, and a rule at the edge of the table when the cell there wants that side. A horizontal segment over the width of a cell is drawn when that cell wants its bottom side or the cell below it wants its top side, the top border when the cell of the first row wants its top side and the bottom border when the cell of the last row wants its bottom side. Rule rows work the same way, so a rule under a cell without a bottom side still appears where the cell below it wants its top side.

A rule that is not drawn keeps its column as a space, so every row stays as wide as the table. A vertical rule that has no horizontal line to connect to leaves its position on that line blank: the rule simply ends at the row above it, or starts at the row below it. A horizontal line that comes out blank over its whole width is not printed at all.

```js
let result = encoder
    .table(
        [ { width: 10 }, { width: 8, align: 'right' } ], 
        [
            [ 'Chidori', '172.80' ],
            [ 'Beer', '13.00' ],
            { rule: true },
            [ { content: '', border: 'none' }, '185.80' ]
        ],
        { outline: 'single', border: 'single' }
    )	
    .encode()
```

Which prints:

```
┌──────────┬────────┐
│Chidori   │  172.80│
│Beer      │   13.00│
└──────────┼────────┤
           │  185.80│
           └────────┘
```

#### The outline of a table

The `outline` option is the frame around the whole table. It is a style for every side, `none`, `single` or `double`, or an object with any of `top`, `right`, `bottom` and `left` set to one of those, where the sides that are left out are `none`. Any other value throws an error. The default is `none`, so a table without the option has no frame, and `border: 'single'` with `rules: 'all'` gives a grid of lines between the cells, without a frame around it.

```js
let result = encoder
    .table(
        [
            { width: 10 },
            { width: 4, align: 'right' },
            { width: 8, align: 'right' }
        ], 
        [
            [ 'Item', 'Qty', 'Price' ],
            [ 'Beer', '2', '13.00' ],
            [ 'Chidori', '2', '172.80' ]
        ],
        { border: 'single', rules: 'all' }
    )	
    .encode()
```

Which prints:

```
Item      │ Qty│   Price
──────────┼────┼────────
Beer      │   2│   13.00
──────────┼────┼────────
Chidori   │   2│  172.80
```

The column of an outer rule is only part of the width of the table where that side of the outline is drawn: without the left or the right side the table is one character narrower there, its contents start at the edge of the table, and a fill column takes the character that is left. A side that is `none` prints nothing at all, the way every horizontal line that has nothing on it does.

The same goes for the dividers between the cells: without a `border` the cells of a row sit next to each other with their margins in between and nothing else, so `outline: 'single'` on its own is a frame around the whole table. The same three columns as above then print:

```
┌──────────────────────┐
│Item       Qty   Price│
│Beer         2   13.00│
│Chidori      2  172.80│
└──────────────────────┘
```

#### The width of a table

By default a table is as wide as the paper. The `width` option makes it narrower, in characters of the size that is active when the table is created, and the table is positioned by the current alignment, just like every other line. A width larger than the paper throws an error.

```js
let result = encoder
    .align('center')
    .table(
        [ { width: 10 }, { width: 8, align: 'right' } ], 
        [ [ 'Total', '185.80' ] ],
        { outline: 'single', border: 'single', width: 21 }
    )	
    .encode()
```

Which prints, centered on 42 column paper:

```
          ┌──────────┬────────┐
          │Total     │  185.80│
          └──────────┴────────┘
```

The width of the table is the widths of the columns, plus all margins, plus one character for every vertical rule: one for every boundary between two cells when the table has a `border`, and one for the left and one for the right side of the outline where those are drawn, which together is the number of columns plus one for a table with a border and an outline on every side. The top and the bottom of the outline are lines of their own, they take no character on a row. That is counted in the space that is available, so a table that is one character too wide throws, and a fill column takes the space that is left after the fixed columns, the margins and the rules, which makes a table with a fill column fill its width exactly.

With only fixed columns the table is as wide as those columns, their margins and their rules, and the `width` is no more than the space the columns are resolved against: only a fill column makes the table fill it.

<br>

### Box

Insert a bordered box. 

The first parameter is an object with additional configuration options.

- `outline`: The style of the border around the box, either `none`, `single` or `double`
- `corners`: The style of the corners, either `square` or `rounded`
- `width`: The width of the box including the border, by default the width of the paper
- `marginLeft`: Space between the left border and the left edge
- `marginRight`: Space between the right border and the right edge
- `paddingLeft`: Space between the contents and the left border of the box
- `paddingRight`: Space between the contents and the right border of the box
- `align`: The alignment of the text within the box, can be `left`, `center` or `right`.

The second parameter is the content of the box and it can be a string, or a callback function.

The width of the box is measured in characters of the size that is active when the box is created, and the content of the box inherits the styles and size, in the same way as the cells of a table.

A box with a border is printed without line spacing, so that the vertical lines of the border touch and the box is drawn as one unbroken frame. The paper is fed by the height of the tallest character on each line, so a line at double height inside a box stays intact. After the bottom border the box restores the line spacing that was active before it.

For example:

```js
let result = encoder
    .box(
        { width: 30, align: 'right', outline: 'double', marginLeft: 10 }, 
        'The quick brown fox jumps over the lazy dog'
    )
    .encode()
```

Rounded corners are only available on printers that have a code page with the glyphs: the Katakana page of Epson compatible printers, which is used for the whole border, and the standard page of Star printers, which has only the corners, so that the lines are still printed from cp437. On any other printer, and on a box with a double border, the corners are square. A printer without a code page with the line drawing glyphs at all draws its borders with dashes, bars and plus signs.

```js
let result = encoder
    .box(
        { width: 30, outline: 'single', corners: 'rounded' }, 
        'The quick brown fox jumps over the lazy dog'
    )
    .encode()
```

<br>

### Rule

Insert a horizontal rule.

The first parameters is an object with additional styling options:

- `style`: The style of the line, either `single` or `double`
- `width`: The width of the line, by default the width of the paper

For example:

```js
let result = encoder
    .rule({ style: 'double' })  
    .encode()
```     

<br>

### Markdown

Print a subset of [GitHub Flavored Markdown](https://github.github.com/gfm/). The command takes the Markdown source as its only parameter and queues the commands that are equivalent to it.

```js
let result = encoder
    .align('center')
    .markdown('# Ichigaya Terminal\n1-Y-X Kudan, Chiyoda-ku')
    .align('left')
    .markdown(document)
    .encode()
```

Everything it prints goes through the commands of the encoder, so every construct is defined as a chain of commands you could have written by hand. The current alignment, font and code page apply to everything it prints, and it can be used inside table cells and boxes.

The current text style is the base of every inline run: a run sets its style and restores the value it found afterwards, instead of toggling it. So `**bold**` inside a bold table cell is a no-op, and `__underlined__` inside an underlined line stays underlined.

The subset is line based: the line structure of the source is the line structure on paper. A newline is a newline, a blank line prints an empty line, and inline styles never cross a line. This deviates from Markdown, where a single newline is a space and blank lines collapse, because a receipt is a layout and what you type is what you get. The hard break of Markdown, a trailing double space or backslash, is stripped and changes nothing. Lines can be separated by a line feed, a carriage return, or both. A line break at the end of the source ends the last line and does not print an extra empty line, and an empty string prints one empty line.

Every block ends with a newline, but none of them starts with one: `markdown()` continues the line that is still open, so `text('a').markdown('# H')` prints the heading behind the `a` instead of on a line of its own. Call `newline()` first if a block has to start on a fresh line.

#### Blocks

Every line of the source is one block, unless noted. A heading, a rule, a table and a list are only recognised when the line starts with them, after at most three spaces.

| Markdown | Equal to |
|---|---|
| `# Heading` | `size(2, 2)`, `bold(true)`, the text, `bold(previous)`, `size(previous)`, `newline()` |
| `## Heading` | the same at `size(1, 2)` |
| `### Heading` and deeper | the same at the current size |
| `---`, `***`, `___`, three or more of the same character with spaces between them allowed | `rule()` |
| a pipe table: a header line, a delimiter line and body lines, until a line without a pipe | `table()`, see below |
| `- item`, `* item`, `+ item` | `table()` with a marker column and a fill column, see below |
| `1. item`, `1) item` | the same with the number as the marker |
| a blank line | `newline()` |
| anything else | the inline content, `newline()` |

A heading needs a space after its hashes, so `#tag` is a line of text. A closing sequence of hashes is not stripped, so `# Title #` prints the trailing hash.

#### Inline

Inside every block:

| Markdown | Equal to |
|---|---|
| `**text**` | `bold(true)` around the text |
| `__text__` | `underline(true)` around the text |
| `*text*`, `_text_` | `italic(true)` around the text |
| `==text==` | `invert(true)` around the text |
| `[text](url)` | the text |
| `![alt](src)` | the alt text |
| `\*`, `\_`, `\=`, `\#`, `\|`, `\-`, `\\` and the other ASCII punctuation escapes | the character |
| everything else, including `` ` ``, `~~`, `>`, HTML and entities | printed as written |

Italic is not supported by most ESC/POS printers and not at all by StarPRNT printers, see the [italic](#italic) command.

A delimiter opens a run when it is not followed by whitespace, and closes one when it is not preceded by whitespace. The underscore delimiters, `_` and `__`, only open and close at a word boundary, so `ORDER_123` is printed as written. A delimiter that does not find its closer on the same line is printed as written as well, and styles can be nested: `**bold and __underlined__**`.

#### Tables

The cells of a pipe table are inline content. The delimiter line gives the alignment of every column: `:--` left, `:-:` center, `--:` right and `---` left. The pipes around a row are optional, and `\|` inside a cell is a literal pipe.

```
| Item    | Qty | Price |
|:--------|----:|------:|
| Beer    |   2 | 13.00 |
| Chidori |   2 | 172.80 |
```

The header row is printed in bold. A header row whose cells are all empty is not printed, which is how you write a table without a header:

```
|     |   |
|-----|--:|
| Tax | 0 |
```

The body of a table runs until a blank line or a line without a pipe. The columns are one space apart, and the width of a column is the length of its longest cell, the header included, measured after the markup is removed. When the columns do not fit the width that is available, the widest column loses one character at a time until they do, and the text of a column that lost characters wraps. When they leave space over, the widest column takes the space that is left, so that a table is as wide as the paper, or as wide as the cell it is printed in. The first of the widest columns takes it when several are equally wide. A row with fewer cells than the delimiter line gets empty ones, extra cells are dropped.

In a space that is too narrow even for one character per column, in a table cell for example, there is no layout left to make: the rows are printed as lines of text with their cells one space apart, the header in bold.

A table has no border in this version.

#### Lists

The marker column of a list is as wide as the widest marker of that list, plus one space, and the text is a fill column, so the wrapped lines of an item hang under its text instead of under its marker. An unordered item has a `-` as its marker, whatever character it was written with, and a numbered item has its number and a period, also when it was written as `1)`. An ordered list counts from the number of its first item, and a nested list counts on its own, starting at the number of its own first item.

Items of any kind that follow each other without a blank line between them are one list, with one marker column that is as wide as the widest marker of all of them. That is why the list of the reference receipt below, which mixes dashes and numbers, prints two spaces after every dash: the marker column is as wide as `2.`, plus one space.

An item that is indented by two or more spaces per level is nested and gets two extra spaces of indent per level, in front of its marker and inside the marker column. A list ends at a blank line or at a line that is not an item.

When the marker column does not leave at least one character for the text, in a narrow table cell for example, every item is printed as a line of text with its marker and a space in front of it instead.

```
- Meals and goods at the reduced tax rate
  - Coffee and tea
- Paid in cash
```

#### Deviations and extensions

- A newline is a newline, see above.
- `__text__` is underlined instead of bold, which GitHub Flavored Markdown makes it. A receipt needs an underline more than it needs a second way to write bold.
- `==text==` prints inverted text, white on black. This is the highlight syntax of several Markdown dialects, and inverted text is what a highlight on a receipt is.
- The delimiters follow the flanking rule of Markdown in its simplest form, not the full algorithm of CommonMark. A delimiter run of three or more characters, such as `***text***`, is printed as written.
- The number of cells of the delimiter line of a table has to match the header line, as it does in GitHub Flavored Markdown, otherwise the lines are printed as text.

#### What is not supported

Code, both inline and fenced, block quotes, strikethrough, task lists, footnotes, setext headings, reference links, autolinks, HTML and entities are not parsed and are printed as written. Images print their alt text, links print their text and drop the target. There are no soft breaks, no lazy continuation lines and no paragraphs that run over several lines.

#### An example

The reference document, with every construct of the dialect on one receipt:

```markdown
# Ichigaya Terminal
1-Y-X Kudan, Chiyoda-ku
02-09-2019 19:00

---

| Item    | Qty | Price |
|:--------|----:|------:|
| Beer    |   2 | 13.00 |
| Chidori |   2 | 172.80 |

---

**TOTAL** 185.80
Cash 200.00
Change 14.20

## Notes
- Meals and goods at the __reduced__ tax rate
- ==Paid== in cash
1. Keep this receipt
2. Visit [our site](https://example.com)

Thank you\!
```

Which prints, on paper 42 characters wide:

```
Ichigaya Terminal
1-Y-X Kudan, Chiyoda-ku
02-09-2019 19:00

──────────────────────────────────────────

Item                            Qty  Price
Beer                              2  13.00
Chidori                           2 172.80

──────────────────────────────────────────

TOTAL 185.80
Cash 200.00
Change 14.20

Notes
-  Meals and goods at the reduced tax rate
-  Paid in cash
1. Keep this receipt
2. Visit our site

Thank you!
```

Everything is printed with the alignment of the encoder, which the Markdown source has no say in: use `align()` around `markdown()` to center the header of a receipt and print the rest to the left.

<br>

### ReceiptLine

Print a [receiptline](https://github.com/receiptline/receiptline) document, the receipt markup language of the OpenReceipt project. The layout is not part of this library: it comes from the `@point-of-sale/receiptline` package, which you give to the encoder with the `receiptline` option when you create it. See [the configuration options](configuration.md#receiptline).

```js
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import * as ReceiptLine from '@point-of-sale/receiptline';

let encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi',
    receiptline: ReceiptLine
});

await encoder
    .initialize()
    .codepage('auto')
    .receiptline(`
{width:*,2,10}
BEER                   | 2|     13.00
CHIDORI                | 2|    172.80
-------------------------------------
^TOTAL                 |  |   ^185.80
`);

let result = encoder
    .cut()
    .encode();
```

This is the one command that is asynchronous, because the images in a document have to be decoded before the document can be printed. It returns a promise that resolves with the encoder, so the commands after it come after an `await`, or in the `then()` of the promise.

The second parameter is an object with the options of the package, such as `cut` for what a cut line becomes and `corners` for rounded corners; see the documentation of `@point-of-sale/receiptline` for all of them. The document positions everything itself, so it prints at left alignment and in the plain style, and it leaves the encoder that way. The final cut is yours to add.

Without the option the command throws. It is not available in table cells and boxes.

<br>

### Barcode

Print a barcode of a certain symbology. The first parameter is the value of the barcode as a string, the second is the symbology.

The following symbologies can be used: `upca`, `upce`, `ean13`, `ean8`, `code39`, `itf`, `code93`, `code128`, `codabar`, `gs1-128`, `gs1-databar-omni`, `gs1-databar-truncated`, `gs1-databar-limited`, `gs1-databar-expanded`, `code128-auto`.

> [!NOTE]
> Just because the symbology is suppored by this library does not mean that the printer will actually support it. If the symbology is not supported, the barcode will simply not be printed, or the raw data will be printed instead, depending on the model and manufacturer of the printer.

In general the printer will automatically calculate the checksum if one is not provided. If one is provided in the data, it will not check the checksum. If you provide the checksum yourself and it is not correctly calculated, the behaviour is not defined. It may calculate the correct checksum use that instead or print an invalid barcode. 

For example with the checksum provided in the data:

```js
let result = encoder
    .barcode('3130630574613', 'ean13')
    .encode()
```

Or without a checksum:

```js
let result = encoder
    .barcode('313063057461', 'ean13')
    .encode()
```

Both examples above should result in the same barcode being printed.

Furthermore, depending on the symbology the data must be handled differently:

| Symbology | Length | Characters |
|-|-|-|
| upca | 11 - 12 | 0 - 9 |
| ean8 | 7 - 8 | 0 - 9 |
| ean13 | 12 - 13 | 0 - 9 |
| code39 | >= 1 | 0 - 9, A - Z, space, or $ % * + - . / |
| itf | >= 2 (even) | 0 - 9 |
| codabar | >= 2 | 0 - 9, A - D, a - d, or $ + − . / : |
| code93 | 1 - 255 | ASCII character (0 - 127) |
| code128 | 1 - 253 | ASCII character (32 - 127) |

This function accepts an object as a third parameter for extra configuration options:

- *height* - the height of the barcode in pixels, defaults to 60.
- *width* - the width of a segment of the barcode, can be a number from 1 to 3, defaults to 2.
- *text* - where a human readable version of the value is printed: `none`, `above`, `below` or `both`, defaults to `none`. The booleans of earlier versions still work: `true` is `below` and `false` is `none`. Star printers print the text below the barcode or not at all, so `above` and `both` print it below on them.

For example to show the number of the barcode:

```js
let result = encoder
    .barcode('313063057461', 'ean13', {
        height: 100,
        text: 'below'
    })
    .encode()
```

Or to increase the size of the barcode:

```js
let result = encoder
    .barcode('313063057461', 'ean13', {
        width: 3,
    })
    .encode()
```

<br>

### Qrcode

Print a QR code. The first parameter is the data of the QR code.

```js
let result = encoder
    .qrcode('https://nielsleenheer.com')
    .encode()
```

This function accepts an object as a second parameter for extra configuration options:

- *model* - a number that can be 1 for Model 1 and 2 for Model 2
- *size* - a number that can be between 1 and 8 for determining the size of the QR code
- *errorlevel* - a string that can be either 'l', 'm', 'q' or 'h'.

For example:

```js
let result = encoder
    .qrcode('https://nielsleenheer.com', { model: 1, size: 8, errorlevel: 'h' })
    .encode()
```

Not all printers support printing QR codes. If the printer does not support it, the QR code will simply not be printed, or the raw data will be printed instead, depending on the model and manufacturer of the printer.

<br>

### PDF417 code

Print a PDF417 code. The first parameter is the data of the PDF417 code.

```js
let result = encoder
    .pdf417('https://nielsleenheer.com')
    .encode()
```

This function accepts an object as a second parameter for extra configuration options:

- *width* - the width of a module in pixels, this 3 by default
- *height* - the height of the module compared to the width, this is 3 by default, making the module 9 pixels high by default
- *columns* - the number of codewords on the horizontal axis, 0 = auto, otherwise between 1 and 30.
- *rows* - the number of codewords on the vertical axis, 0 = auto, otherwise between 3 and 90.
- *errorlevel* - a number between 0 and 8.
- *truncated* - a boolean, if set to true the stop pattern is not printed.

For example:

```js
let result = encoder
    .pdf417('https://nielsleenheer.com', { width: 4, height: 4, errorlevel: 8 })
    .encode()
```

Not all printers support printing PDF417 codes. If the printer does not support it, the PDF417 code will simply not be printed, or the raw data will be printed instead, depending on the model and manufacturer of the printer.

<br>

### Image

Print an image. The image is automatically converted to black and white and can optionally be dithered using different algorithms.

The first parameter is the image itself. 

When running in the browser it can be an `ImageData` object, an `ImageBitmap`, or any element that can be drawn onto a canvas, like an `<img>`, `<svg>`, `<canvas>` or `<video>` element. 

When using Node you have multiple options:

- First of all, you can provide an `ImageData` object, which many libraries can export, such as `@canvas/image`, `canvas` and `image-pixels`.

- You can also provide raw pixel data provided by other common libraries, such as `readimage`, `sharp` and `get-pixels`.

- And finally you can provide a `Canvas` or `Image` object used by the `canvas` library. However, if you provide an `Image` object the library needs to convert it to a canvas and for that you need to provide a `createCanvas` function when instantiating the encoder (In previous versions you did not need to do this, because the `canvas` library was a dependency, but in recent versions this has become an optional dependency).

The second parameter is an object with options for the size of the image on the paper and for dithering:

- *width* - the width of the image on the paper in dots. The image is resized to this width.
- *height* - the height of the image on the paper in dots. The image is resized to this height.
- *algorithm* - the dithering algorithm that is used to turn colour and grayscale images into black and white. The following algorithms are supported: `threshold`, `bayer`, `floydsteinberg` and `atkinson`. If not supplied, it will default to a simple threshold.
- *threshold* - the threshold that will be used by the threshold and bayer dithering algorithm. It is ignored by the other algorithms. It is set to a default of 128.

You only need to specify one of `width` and `height`, the other one follows from the aspect ratio of the image. If you specify both, the image is stretched to that size. If you leave out both, the image is printed at its own size, unless it is wider than the paper, in which case it is scaled down to fit.

Printers need the width and height of an image to be a multiple of 8 dots. You do not need to take care of that yourself: the size is rounded up to the next multiple of 8 and the extra dots are white.

For example on the web:

```js
let encoder = new ReceiptPrinterEncoder();

let img = new Image();
img.src = 'https://...';

img.onload = function() {
    let result = encoder
        .image(img, { width: 320, algorithm: 'atkinson' })
        .encode()
}
```

Or in Node using `sharp`:

```js
import sharp from "sharp";

let buffer = await sharp('image.png')
    .raw()
    .toBuffer({ resolveWithObject: true });

let encoder = new ReceiptPrinterEncoder();

let result = encoder
    .image(buffer, { width: 320, algorithm: 'atkinson' })
    .encode();
```

Or in Node using `canvas`:

```js
import { createCanvas, loadImage } from 'canvas';

let image = await loadImage('image.png');

let encoder = new ReceiptPrinterEncoder({
    createCanvas
});

let result = encoder
    .image(image, { width: 320, algorithm: 'atkinson' })
    .encode();
```

To print an image as wide as the paper, use the `printableWidth` property of the encoder. It is the width of the print area in dots, based on the number of columns and the width of the default font, so it follows the printer model or the `columns` option that you configured:

```js
let encoder = new ReceiptPrinterEncoder({
    printerModel: 'epson-tm-t88vi'
});

let result = encoder
    .image(image, { width: encoder.printableWidth })
    .encode();
```

For backwards compatibility you can also pass the width, height, algorithm and threshold as separate parameters: `image(image, 64, 64, 'atkinson', 128)`.

You can find examples for many types of image reading libraries in the `examples` directory.

> [!TIP]
> If you are trying to print an image on an ESC/POS printer and it does not work properly, you can try changing the image mode in the [configuration settings](configuration.md#image-mode). Some printers only support `raster` mode, other printers only support `column` mode.

<br>

### Pulse

Send a pulse to an external device, such as a beeper or cash drawer. 

```js
let result = encoder
    .pulse()
    .encode()
```

The first parameter is the device where you want to send the pulse. This can be 0 or 1 depending how the device is connected. This parameter is optional an by default it will be send to device 0.

The second parameter is how long the pulse should be active in milliseconds. The default is 100 milliseconds on ESC/POS printers and 200 milliseconds on StarPRNT printers.

The third parameter is how long there should be a delay after the pulse has been send in milliseconds. The default is 500 milliseconds on ESC/POS printers and 200 milliseconds on StarPRNT printers.

```js
let result = encoder
    .pulse(0, 100, 500)
    .encode()
```

<br>

### Cut

Cut the paper. Optionally a parameter can be specified which can be either be "partial" or "full". If not specified, a full cut will be used. 

```js
let result = encoder
    .cut('partial')
    .encode()
```

Not all printer models support cutting paper. And even if they do, they might not support both types of cuts.


> [!TIP]
> If the location of your printers cutter is higher than the last line of printed text, you may need to feed the paper some extra lines. You can use [the `feedBeforeCut` configuration option](configuration.md#feed-before-cut) to do this automatically.

<br>

### Raw

Add raw printer commands, in case you want to send a command that this library does not support natively. For example the following command is to turn of Hanzi character mode on ESC/POS printers

```js
let result = encoder
    .raw([ 0x1c, 0x2e ])
    .encode()
```     

Please be aware that raw printer commands are language specific. Depending on the language your printer supports you may need to send different commands.
