# ReceiptPrinterEncoder
**Formally known as EscPosEncoder, StarPrntEncoder and ThermalPrinterEncoder**

<br>

Create a set of commands that can be send to any receipt printer that supports ESC/POS, StarLine or StarPRNT.

- [About ReceiptPrinterEncoder](../README.md)
- [Usage and installation](usage.md)
- [Configuration options](configuration.md)
- [Handling text](text.md)
- [Commands for creating receipts](commands.md)
  - [Lifecycle](commands.md#lifecycle)
  - [Initialize](commands.md#initialize)
  - [Codepage](commands.md#codepage)
  - [Text](commands.md#text)
  - [Newline](commands.md#newline)
  - [Line](commands.md#line)
  - [Underline](commands.md#underline)
  - [Bold](commands.md#bold)
  - [Italic](commands.md#italic)
  - [Invert](commands.md#invert)
  - [Align](commands.md#align)
  - [Font](commands.md#font)
  - [Width](commands.md#width)
  - [Height](commands.md#height)
  - [Size](commands.md#size)
  - [Line spacing](commands.md#line-spacing)
  - [Tables and boxes](tables-and-boxes.md)
    - [Table](#table)
    - [Box](#box)
  - [Rule](commands.md#rule)
  - [Markdown and ReceiptLine](markup.md)
    - [Markdown](markup.md#markdown)
    - [ReceiptLine](markup.md#receiptline)
  - [Barcodes](barcodes.md)
    - [Barcode](barcodes.md#barcode)
    - [Qrcode](barcodes.md#qrcode)
    - [PDF417 code](barcodes.md#pdf417-code)
  - [Image](commands.md#image)
  - [Pulse](commands.md#pulse)
  - [Cut](commands.md#cut)
  - [Raw](commands.md#raw)
- [Printing receipts](printing.md)
- [Migrating from version 3 to version 4](changes.md)
- [Migrating from version 2 to version 3](changes.md#migrating-from-version-2-to-version-3)

<br>

## Tables and boxes

The `table()` and `box()` commands lay out text in columns and inside borders. They share the same options for outlines, corners and width, and they inherit the style and size of the encoder at the moment they are called. Both commands are part of the [commands for creating receipts](commands.md) and this chapter describes them in detail.

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
