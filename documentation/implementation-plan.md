# Implementation plan: Markdown, receiptline, and what the encoder needs first

This plan replaces Section 20 of the renderer's implementation plan, which proposed one package with two parsers and a shared block structure. That is not what we want. The work splits into three parts, in this order:

1. **The encoder learns what receiptline needs.** An inventory of every construct of the receiptline language against the commands the encoder has, and the features that are missing: bordered tables with junctions, rounded corners and the line spacing that makes vertical rules touch. These are useful to every user of the encoder, not only to receiptline documents.
2. **A `markdown()` method on the encoder.** A small subset of Markdown for styling text: bold, underline, headings, rules, simple tables, lists. Nothing more.
3. **A separate package, `@point-of-sale/receiptline`.** It takes an encoder the application has already initialized plus a receiptline document, queues the commands for the receipt onto the encoder, and hands the encoder back. The application can then add more and call `encode()` itself. Its parser and layout are receiptline's own code, vendored and modified, and the package is published under Apache 2.0 like receiptline.

Part 1 has to land before Part 3 can start, because the package needs the line spacing command of Section 2. Part 2 is independent of Part 3 but shares the bordered tables of Part 1, so it comes after them.

Sections 1 to 4 are encoder work and follow the usual orchestration: a plan section, an implementation agent, a bug-check agent, a review, a commit per accepted section. The package sections at the end move to the package repository's own plan when that repository is created.

---

## Part 1: What receiptline needs from the encoder

### How receiptline lays out a receipt

The reference implementation is `receiptline` 4.0.4 (Apache 2.0). Its model, as far as it matters here:

- A document is a list of lines. Every line is independent: a text line, a property line `{...}`, a rule line `-`, a cut line `=`, or an image, code or command line. Blank lines print an empty line.
- A text line is one or more columns separated by `|`. The whitespace around the pipes gives each column its alignment: `|text|` centred, `|text` left, `text|` right, and a space between the pipe and the text pushes the text away from that pipe. A line is trimmed first, so `~` is the only way to write a leading or trailing space.
- Properties are state that persists: `width` (a list of column widths in characters, `*` a fill column, `auto` all fill columns, a number fixed, `0` or missing removes the column), `border` (`line`, `space` which is 1, `none` which is 0, or `0` to `2` characters between columns), `align` (of the line within the paper when it is narrower than the paper, default centre), `text` (`wrap` or `nowrap`), `option` (the defaults for the next codes). `image`, `code`, `command` and `comment` are one-off.
- Widths are resolved per line: fixed widths first, the border characters are subtracted, fill columns share what is left (`floor((v + i) / n)` per column, so the last fill columns get the extra character), and when the fixed columns do not fit, the widest column loses one character at a time until they do. Columns beyond the number that fit at one character each are dropped. A text line with fewer columns than widths gets empty columns.
- Text in a column wraps **per character**, not per word: the next character that does not fit starts a new line. Every wrapped line is aligned on its own within the column. `\n` wraps by hand. With `text: nowrap` only the first wrapped line of every column is printed and the rest is dropped, including everything after a `\n`.
- Decorations toggle: `_` underline, `"` bold, `` ` `` invert, `^` sizes: one caret double width, two double height, three 2 by 2, then one more per caret up to 6 by 6, and the same count again returns to normal. A character at double width counts as two in the column. Style is reset before every run.
- `border: line` starts a run of vertical rules. The first text line after it prints a top border, every text line prints a vertical rule at every column boundary and both edges, as tall as the tallest text on that printed line, and a rule line `-` inside the run prints a junction line instead of a plain rule. The run ends with a bottom border when the border changes to `space` or `none`, at a cut, or at the end of the document. A rule line directly after the border starts is dropped. Column widths may change from line to line while the run continues: without a rule line the vertical rules simply jump to the new positions, with a rule line the junction merges the bottom of the layout above and the top of the layout below, including a shift of the left and right edges when the layouts are aligned differently.
- Line spacing is zero during a run of vertical rules, so that the `│` glyphs of consecutive lines touch. By default receiptline prints all text that way; with `spacing: true` it uses the printer's default spacing outside the runs.
- Cuts are partial cuts with feed. The final cut is a printer setting, not part of the document.
- Images are base64 PNGs printed at their own size, aligned like the line. Barcodes use the printer's native commands. QR codes are rasterized by receiptline and printed as an image, so that they look the same on every printer.
- ESC/POS rules are drawn from the Epson Katakana page (`ESC t 1`), where the four corners are the rounded `╭ ╮ ╰ ╯` and the rest is `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼`. StarPRNT rules are drawn from cp437 with the square corners. That is why the renderer's parity test lists every bordered example as an exception.

### The inventory

| receiptline | Encoder today | Status |
|---|---|---|
| A text line, column alignment from the pipes | `align()`, `line()`, `table()` with `align` per column, which accepts `left`, `center` and `right` | available (the docs of `table()` only mention `left` and `right`, fix in Section 3) |
| `align` of a line narrower than the paper | `align()` before a table of that width: the composer pads a narrower line the same way, `floor(v / 2)` for centre | available |
| Column widths, `*`, `auto`, `0`, reduction, dropped columns | `table()` with fixed and fill columns; fill columns share the rest with the first ones getting the extra character | available, but the reduction and the ordering of the remainder are receiptline rules the package applies before calling the encoder |
| `border: space` and `none`, `0` to `2` | `marginRight` on every column but the last | available |
| `border: line` | nothing: `table()` has no borders, only `box()` draws them and only around one column of content | **gap, Section 3** for the encoder's own users; the package draws its borders as text |
| A rule line between rows, inside or outside a border run | `rule()` between two `table()` calls for the unbordered case, nothing for the junction line of a bordered table | **gap, Section 3** (rule rows) for the encoder's own users; the package draws its junctions itself |
| Vertical rules as tall as the tallest text on the line | `box()` does this for its own borders (`size(1, height)` around the `│`) | reuse in Section 3 |
| Column layouts that change inside one border run | nothing | package: the vendored layout composes every line itself, so the encoder does not need to know |
| Rounded corners on ESC/POS | `box()` uses the square corners of cp437 | **gap, Section 1** |
| Zero line spacing while rules run | the language layer has `line-spacing` items and uses them around column mode images (`ESC 3 24` and `ESC 2`, Star `ESC 0` and `ESC z 1`), never for text and not as a command | **gap, Section 2** |
| Per character wrapping, `nowrap`, `\n` | word wrapping | package: the vendored layout wraps, the encoder only prints finished lines (see below) |
| `_`, `"`, `` ` `` | `underline()`, `bold()`, `invert()` | available; ESC/POS underline is 1 dot in the encoder and 2 in receiptline, accepted difference |
| `^` sizes up to 6 by 6 | `size()` up to 8 by 8 on ESC/POS, the language layer sends whatever it gets on StarPRNT | available; the package clips at 6 |
| Mixed sizes on one line and in cells | supported, widths are measured in characters of the size the table was created at | available |
| `-` rule line, full width or the width of the current layout | `rule({width})` with the current alignment | available |
| `=` cut | `cut('partial')` | available |
| `{image: base64}` | `image()` takes ImageData or raw RGBA, no PNG decoding | package: its own PNG decoder |
| `gradient`, `threshold`, `gamma` | `image()` with `algorithm` and `threshold`; no gamma | available except gamma, which is dropped |
| `{code: ...}` barcodes: `upc`, `ean`/`jan`, `code39`, `itf`, `codabar`/`nw7`, `code93`, `code128`; module width 2 to 4; height 24 to 240; `hri` | `barcode()` with `upca`/`upce`, `ean13`/`ean8` chosen by length, `width` 1 to 3 which the ESC/POS layer sends as `GS w` 2 to 4, `height`, `text` | available; receiptline width `w` is encoder width `w - 1` |
| `qrcode` with cell 3 to 8 and level | `qrcode({size, errorlevel})`, native | available; native instead of rasterized, accepted difference |
| `{command: ...}` | `raw()` | available |
| `{comment: ...}` | nothing to print | package |
| `~`, `\n`, `\xnn`, escapes | plain text | package |
| `cpl` | `columns` of the encoder | the application's |
| `encoding`: `cp437` and the other single byte pages, `multilingual` | `codepage(name)` and `codepage('auto')` | the application's, set before handing the encoder over; CJK and Thai encodings are not supported by the encoder |
| `upsideDown`, `margin`, `marginRight`, `spacing` | nothing | out of scope, see below |
| Wide (CJK) characters, Thai combining characters | not supported by the encoder | out of scope |
| The final cut of `close()` | `cut()` | the application's |

### What the package does itself, and why

Character wrapping, the width resolution, the reduction of columns that do not fit, the alignment magnet and the border state machine are rules of the receiptline language, not printing capabilities. The encoder's word wrapping is the better default for its own users, and the two would need a per column switch to coexist. The package therefore keeps receiptline's own layout code, which composes every printed line itself: it decides what goes where, and the encoder prints finished lines with the styles set around the runs. The encoder's `table()` is not used by the package at all, which is why Section 3 only has to serve the encoder's own users. The one thing the composed lines cannot do through today's commands is the line spacing, which is Section 2.

### What stays out of scope

- `upsideDown` reverses the order of everything and prints with `ESC { 1`. The encoder has no upside down mode and would need to reorder its queue for it. Not planned.
- `margin` and `marginRight` set the print area with `GS L` and `GS W`. The application can set `columns` instead.
- `spacing: false`, receiptline's default, prints all text without line spacing. The encoder prints with the printer's default spacing everywhere except inside borders, which is what receiptline does with `spacing: true`. The compatibility tests capture receiptline with `spacing: true`. A `lineSpacing` option for the encoder is a possible follow-up, not part of this plan.
- `gamma` has no equivalent in the encoder's dithering.
- The 2 dot underline of ESC/POS, and the rasterized QR code.
- Multibyte encodings.

---

## Part 2: Encoder sections

Every section delivers code in `src/`, tests in `test/` that run without the `canvas` native module (two existing test files cannot load on this machine because of it, see `analysis.md`; the new tests must not add to that), documentation in `documentation/commands.md`, an entry under "New in version 4" in `documentation/changes.md`, JSDoc typedefs so that `npm run build` produces the declarations, and a clean `npm run lint`.

### Section 1: Rounded corners

`box()` gets a `corners` option, `'square'` (the default and today's behaviour) or `'rounded'`. The `table()` of Section 3 gets the same option. `border: 'double'` has no rounded glyphs and ignores the option.

The border style option of `box()` is renamed from `style` to `border`, so that it reads the same as the `table()` option of Section 3 and does not suggest a text style. `style` stays accepted as an alias for existing code, undocumented except for one line in `changes.md`; when both are given, `border` wins. The documentation, the typedef and the examples use `border` only.

The rounded corners come from the code page that has them, which depends on the printer's code page mapping:

- ESC/POS: `epson/katakana` has `╭ ╮ ╰ ╯` at `0x9c` to `0x9f`, and also every straight single line glyph (`─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` at `0x8f` to `0x9b`). It is in the mappings of Epson, Citizen, Bixolon, Fujitsu, Metapace, Xprinter, Youku, POS-5890 and POS-8360. It is not in the HP, MPT, SUNMI and Star mappings. When it is available, a rounded border line is drawn entirely in that page, which makes the bytes identical to what receiptline sends.
- StarPRNT and Star Line: `star/standard` has the rounded corners at `0xef`, `0xff`, `0xfd` and `0xfe` and no straight glyphs. The corners come from that page and the lines from cp437; the composer already switches code pages between text fragments, so a border line is four fragments at most.
- Anything else: square corners, without a warning. The documentation says so.

The lookup is generic rather than hardcoded on the two names: the encoder takes the first page in its mapping in which all four corner glyphs encode, and prefers a page in which the straight glyphs encode as well. `CodepageEncoder.encode()` returns `?` for a glyph a page does not have, which is the test. The result is computed once per encoder.

The glyph selection moves into a small border helper (`src/border.js`) that Section 3 reuses: given a style, the corners option and the mapping it returns the glyph and code page for each of the eleven single line shapes, or the double line shapes.

Tests: a box with rounded corners on an Epson mapping is byte for byte the Katakana page line receiptline sends for the same shape; on the Star mapping the corners switch pages and the lines stay in cp437; on the SUNMI mapping the output equals the square box; `border` and `style` produce the same bytes, and `border` wins when both are given; every existing box test still passes unchanged.

### Section 2: Line spacing inside borders

A bordered box or table sets the line spacing to zero before its first line and restores the default after its last, on all languages: ESC/POS `ESC 3 0` and `ESC 2`, StarPRNT and Star Line `ESC 0` and `ESC z 1`. These are the commands receiptline uses for the same purpose, and the encoder already emits the Star pair and the ESC/POS restore around column mode images; the language layer gets a `lineSpacing(value)` method with `'default'` and `'none'` that both image code paths and the borders use. With zero spacing the printer feeds by the height of the tallest character on the line, so a double height line inside a box stays intact and the `│` glyphs of consecutive lines touch.

The same command is public on the encoder, because the receiptline package composes its bordered lines itself and needs it around them:

```js
encoder
    .lineSpacing('none')
    .line('│ Lines that touch │')
    .lineSpacing('default');
```

It is a state command like `align()`: it takes effect on the line feed that follows it, which is the feed of the current line when it is called in the middle of a line, it is emitted before the alignment padding of the line it is pending on, and `initialize()` resets it. The documentation says what it is for and that text printed with `'none'` has no gap between lines.

The `line-spacing` item type already exists in the composer and is a leading type, so the command goes before the alignment padding of the line it is pending on. The restore is written on the last line of the box, in front of its line feed, so that the paper is fed as usual after the box.

**Who emits it.** The lines of a table cell and of a box are interleaved with the lines of the cells next to them, so an embedded encoder cannot change the line spacing itself: the restore of a short bordered cell would land halfway through a taller neighbour and break its vertical lines. An embedded encoder therefore only records that its lines need zero spacing, and the encoder it is embedded in wraps the lines that cell is part of: `box()` wraps its own lines when it has a border or when its contents asked for it, and `table()` wraps a whole row when any cell of that row asked for it. The request propagates upwards, so a box inside a table inside a box ends up with one command at the start of the outermost block and one restore at its end. For the bordered tables of Section 3 this is the same thing one level up: the table's own borders wrap the whole table, a request from a cell wraps the row it is in.

This changes the bytes of every `box()` with a border compared to version 3, and on paper it closes the gap between the vertical bars that version 3 boxes have on every printer whose default spacing is larger than the character height, which is all of them (1/6 inch is 30 dots at 180 dpi and 34 at 203 dpi, font A is 24 dots high). The change is listed under "New in version 4" in `changes.md`.

Acceptance includes a printout: a box and a Section 3 table on an Epson and on a Star printer, checked for touching bars and for a double height line inside a box.

### Section 3: Table borders, rule rows, spans and width

`table()` gets a third parameter with options:

```js
encoder.table(columns, rows, {
    border: 'none',        // 'none' (default), 'single' or 'double'
    corners: 'square',     // 'square' (default) or 'rounded', see Section 1
    rules: 'none',         // 'none' (default) or 'all': a rule between every pair of rows
    width: undefined,      // the width of the table in characters, default the width of the paper
});
```

Rows may be two things, and a cell may be three:

```js
[ 'Cell', 'Cell' ]                                    // a row of cells, as today
{ rule: true }                                        // a horizontal rule row

'Cell'                                                // a string, as today
(encoder) => encoder.bold().text('Cell')              // a callback, as today
{ span: 2, content: 'Cell', align: 'right' }          // a cell that spans columns
```

The typedefs are `TableRow = TableCell[] | TableRule` and `TableCell = TableCellContent | TableSpannedCell`, where `TableSpannedCell` has `span`, `content` (a string or a callback) and an optional `align`.

**Geometry.** The table is resolved against its `width`, in characters of the current size, or the paper when there is none; a `width` larger than the paper throws. With a border, the width of the table is the sum of the column widths and margins plus one character per vertical rule, which is the number of columns plus one. Fill columns take both into account, so a table with a fill column always fills its `width` exactly. The margins of a column sit inside the border, between the vertical rule and the content. Without a border and without a `width` nothing changes for existing tables. The table is positioned by the current alignment, the way every table line is today, so `align('center')` with a `width` gives a centred narrow table.

**Spans.** A spanned cell covers `span` consecutive columns, starting at its position in the row. Its width is the sum of the widths of the covered columns, plus the margins between them (every `marginRight` except the last column's and every `marginLeft` except the first's), plus one character for every vertical rule it swallows when the table has a border, which is `span - 1`. Its left margin is the `marginLeft` of the first covered column and its right margin the `marginRight` of the last, so that the row still adds up; its alignment default, `verticalAlign` and `overflow` are those of the first covered column, and `align` on the cell overrides the alignment. The spans of a row have to add up to the number of columns exactly, otherwise the table throws with the row number. A span of 1 is a plain cell with an `align` override.

**Rows.** A bordered row prints, per line of the row, `│`, then for each cell its left margin, the cell line padded to the cell width, its right margin, then `│`. For the `│` the height is set to the largest height of that printed line and the width stays the current width, and the height is restored after it, exactly as `box()` does. The cells are composed by the embedded encoders as today; a spanned cell is an embedded encoder of the spanned width, nothing else changes in the cells.

**Rule rows and borders.** The top border, the bottom border and every rule row are one line each, built by the border helper from the connectivity at each character position: `up` where the row above has a vertical rule, `down` where the row below has one, `left` and `right` inside the table. A bordered row has rules at the left edge, at the right edge and at every boundary between two of its cells, so a spanned cell has no rule inside it. The glyph follows from the four bits: `┼` for all four, `┴` and `┬` for three, `├` and `┤` for three at the edges, the four corners for two at a right angle, `─` for left and right. With `corners: 'rounded'` the four corners are the rounded ones; with `border: 'double'` the double set. The top border has no `up`, the bottom border no `down`, a rule row has both, so between two rows with the same boundaries it is `├ ┼ ┤`, and above or below a spanned cell the `┼` becomes `┴` or `┬`.

`rules: 'all'` inserts a rule row between every pair of rows; explicit rule rows in the data are still allowed. A rule row in a table without borders is a `─` line over the width of the table. A rule row directly after the top border, directly before the bottom border, or directly after another rule row is dropped, so `rules: 'all'` and explicit rule rows never double up.

**Line spacing** around a bordered table as in Section 2. The state items of the table's own borders go around the whole table, not per row; a request that comes from the contents of a cell wraps that row, see Section 2.

**Docs.** The `align` property of a column is documented as `left`, `center` or `right`. The two row forms, the spanned cell, the `border`, `corners`, `rules` and `width` options and the width accounting are documented with a bordered receipt example that has a spanned total row and a centred narrow table. The `border`, `corners` and `width` options read the same on `box()` and `table()`, after the rename of Section 1.

**Tests.** Tests are in `test/table-border.js` and `test/table-span.js`: a single row bordered table equals the same content in a `box()` with `paddingLeft` and `paddingRight` zero, byte for byte, on all three languages; rule rows produce `├ ┼ ┤`; `rules: 'all'` equals the same table with explicit rule rows, and both together do not double up; rounded corners on the Epson mapping produce receiptline's bytes; a rule row at the top, at the bottom and doubled is dropped; a double height cell makes the `│` of that line double height and nothing else; a bordered table that is too wide throws with the border characters counted; a fill column in a bordered table takes the width minus the rules, and with a `width` fills exactly that; a `width` larger than the paper throws; a centred table with a `width` is padded like a centred line; a spanned cell over two columns with margins and a border has the computed width, and the rule rows above and below it show `┴` and `┬` at the swallowed boundary; a span that does not add up throws with the row number; a spanned cell wraps, clips and aligns like a plain cell of that width; spans in an unbordered table; `overflow: 'clip'` cells inside a border; unbordered tables with rule rows; nesting, in `test/nesting.js`: a bordered table inside a cell of a bordered table, a bordered table inside a box and a box inside a bordered cell, checked as strings of the paper, with the line spacing commands of the inner table appearing once at its start and once at its end inside the outer table's lines, and a nested table with a `width` resolved against the cell width; every existing table test still passes unchanged. Nesting of tables and boxes works today in every combination (a table in a cell, a box in a cell, a table in a box, a box in a box) but no test says so, which `test/nesting.js` fixes for the unbordered cases as well.

### Section 3b: Borders per cell

A cell of a bordered table can turn its own border off, entirely or per side:

```js
{ content: 'Total', span: 2, border: 'none' }                 // no border on any side
{ content: 'Total', border: { left: 'none', bottom: 'none' } } // the sides that are left out keep the table's style
```

The values a cell may use are the table's own border style and `'none'`; a cell that asks for the other style throws with a message saying that a cell can only turn its border off, because single and double lines cannot be joined on every printer (the Epson Katakana page has no mixed junctions). A plain cell, a string or a callback, has the table's border on every side. Cells in a table without a border ignore the property.

**The model.** An edge is drawn when either of the cells next to it wants it. A vertical rule at a boundary is drawn when the cell on its left wants its right side or the cell on its right wants its left side; a rule at the table's edge when the edge cell wants that side. A horizontal segment between two rows is drawn over a cell's width when that cell wants its bottom side or the cell below it wants its top side; the top border when the cell of the first row wants its top, the bottom border when the cell of the last row wants its bottom. A suppressed rule keeps its column as a space, so every row stays as wide as the table. A horizontal line that comes out blank over its whole width is not printed at all.

**What changes.** The row's vertical rule positions (`#tableRules`) are filtered by ownership instead of listing every boundary. The horizontal line builder (`#tableBorder`) takes, next to the rule positions above and below, the positions covered by owned horizontal segments, and derives the left and right bits of every position from them, instead of assuming a line everywhere inside the table; the connectivity map and the glyph function stay, with a blank result for no bits and for a single vertical bit, because a rule that has no horizontal line to connect to simply ends at the row above it or starts at the row below it, instead of a corner pointing into nothing. The row renderer prints a single width space instead of `│` where a rule is not owned. Rule rows, `rules: 'all'` included, follow the same ownership: a rule under a cell without a bottom side still appears where the cell below wants its top side.

The example that motivates the section, a two by two table with a rule row between its two rows and the bottom left cell turned off:

```
┌──────────┬───────────┐
│          │           │
└──────────┼───────────┤
           │           │
           └───────────┘
```

**Docs.** The `border` property of a cell in the Table section of `commands.md`, both forms, the rule that a cell can only turn its border off, and the example above. A bullet in `changes.md`.

**Tests.** In `test/table-border.js` or a new `test/table-cell-border.js`, as byte assertions or as strings of the paper: the example above; the same with the bottom right cell off instead; every cell off, which prints the rows with spaces where the rules were and no horizontal lines at all; a per side form with only the left side off, and only the bottom; a cell with `border: 'none'` in the middle of three columns; a spanned cell without a border under two bordered cells (`┴` becomes `┘` and `└` at the ends and the segment stays because the cells above own it); `rules: 'all'` with a borderless cell; rounded corners with a borderless corner cell, where the corner moves to the next owned position; the throw for the other style; a plain cell next to a borderless one; a table without a border ignoring the property. The randomised geometry check of Section 3, if it exists as a test, extends to random per cell borders: every line still has the width of the table and every junction matches the rules around it.

### Section 3c: Outline and margins per cell

Two additions to the bordered table, both on the ownership model of Section 3b.

**Outline.** A table option `outline`, with the vocabulary of the cell borders: `'none'` turns the whole outline off, an object with any of `top`, `right`, `bottom` and `left` set to `'none'` turns those sides off, and the sides left out keep the table's style. The outline is applied as a mask after the cell borders are resolved: the top side of the cells of the first row, the bottom side of the cells of the last row, the left side of the first cell of every row and the right side of the last cell of every row are cleared where the outline is off. With `rules: 'all'` that gives grid lines between the cells only; with `rules: 'none'` only the vertical dividers.

The columns of the outer rules are part of the width accounting only where the outline is on: with `outline: 'none'`, or with `left` or `right` off, the table has one rule character fewer on that side, so its content spans the full width and a fill column takes that character. The top and bottom lines are then blank over their whole width and are not printed, which Section 3b already does. A table without a border ignores the option. The option is validated like the cell borders: a side may only be turned off.

**Margins per cell.** A cell object accepts `marginLeft` and `marginRight`, which override the margins of the column for that cell. The cell keeps the total of the column, so its content width is the column's width plus the column's margins minus the cell's, and every row stays as wide as the table; a cell whose margins leave no width for the content throws with the row number. For a spanned cell the override applies to its outer margins, the margins between the covered columns stay. Plain cells keep the column's margins.

**Docs.** The `outline` option next to `border`, `corners`, `rules` and `width` in the Table section of `commands.md`, with an example of a grid without an outline, and the two cell properties in the list of cell properties; bullets in `changes.md`.

**Tests.** In `test/table-cell-border.js` or a new file: a grid with `rules: 'all'` and `outline: 'none'`, asserted as a string of the paper and one character narrower on each side, with a fill column taking the width; `outline: { top: 'none' }` keeping the sides and the bottom; `outline: { left: 'none' }` shifting the content by one character; the outline of a table without a border ignored; the throw for a wrong value; a cell with `marginLeft: 2` in a column with `marginLeft: 0` printing its content two characters in with the row still the table's width; a cell whose margins exceed the column throwing; a spanned cell with overridden outer margins; the randomised geometry check extended with random outlines and random cell margins. Every existing test unchanged.

### Section 4: `markdown()`

```js
encoder
    .align('center')
    .markdown('# Ichigaya Terminal\n1-Y-X Kudan, Chiyoda-ku')
    .align('left')
    .markdown(document);
```

`markdown(text)` parses a subset of GitHub Flavored Markdown and queues the equivalent commands. It has no options. Everything it prints goes through the commands the encoder has, so every construct is defined as equal to a chain of existing commands, and the tests check exactly that equality. The current alignment, font and code page apply to everything the method prints. The current style is the base: `**bold**` inside a bold table cell is a no-op, and after a run the previous value is restored rather than toggled.

The subset is line based: the line structure of the source is the line structure on paper. A newline is a newline, a blank line prints an empty line, and inline styles do not cross a line. This deviates from Markdown, where a single newline is a space and blank lines collapse, because a receipt is a layout and what you type should be what you get. A trailing double space or backslash, Markdown's hard break, is stripped and changes nothing.

Blocks, one per source line unless noted:

| Markdown | Equal to |
|---|---|
| `# Heading` | `size(2, 2)`, `bold(true)`, the text, `bold(previous)`, `size(previous)`, `newline()` |
| `## Heading` | the same at `size(1, 2)` |
| `### Heading` and deeper | the same at the current size |
| `---`, `***`, `___` (three or more, spaces allowed) | `rule()` |
| a pipe table: a header line, a delimiter line, body lines, until a line without a pipe | `table()`, see below |
| `- item`, `* item`, `+ item` | `table()` with a marker column and a fill column, see below |
| `1. item`, `1) item` | the same with the number as marker |
| a blank line | `newline()` |
| anything else | the inline content, `newline()` |

Inline, inside every block:

| Markdown | Equal to |
|---|---|
| `**text**` | `bold(true)` around the text |
| `__text__` | `underline(true)` around the text. A deviation from GFM, where it is bold; a receipt needs an underline more than a second way to write bold |
| `*text*`, `_text_` | `italic(true)` around the text, with the note that few printers print it |
| `==text==` | `invert(true)` around the text. An extension, the highlight syntax of several Markdown dialects, which is what inverted text on a receipt is |
| `[text](url)` | the text |
| `![alt](src)` | the alt text |
| `\*`, `\_`, `\=`, `\#`, `\|`, `\-`, `\\` and the other ASCII punctuation escapes | the character |
| everything else, including `` ` ``, `~~`, `>`, HTML and entities | printed as written |

Delimiters follow the flanking rule in its simplest form: an opening delimiter is not followed by a space, a closing delimiter is not preceded by one, and `_` and `__` only open and close at word boundaries so that `ORDER_123` stays intact. An unmatched delimiter is printed as written. Styles nest (`**bold and __underlined__**`).

**Tables.** Cells are inline content. The delimiter line gives the alignment (`:--` left, `:-:` centre, `--:` right, `---` left). The header row is printed in bold; a header row whose cells are all empty is not printed, so that receipts can have tables without a header (`| | |` followed by `|-|-|`). Columns are one space apart (`marginRight: 1`). The width of a column is the length of its longest cell, header included, measured after the markup is removed. When the columns do not fit the paper, the widest column loses one character at a time until they do, and text in a reduced column wraps. When they leave space over, the widest column, the first of them on a tie, takes all of it, so a table is as wide as the paper or as the cell it is printed in. No borders in this version; `border` is the first candidate for an options object later.

**Lists.** The marker column is as wide as the widest marker of the list plus one space, the text is a fill column, so that wrapped lines hang under the text. Ordered lists count from the first item's number. A nested item, indented by two or more spaces, gets two extra spaces of indent per level, in the marker column. A list ends at a blank line or a line that is not an item.

The reference document, every construct of the dialect on one receipt:

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

The parser lives in `src/markdown.js` and produces the blocks; the method in `receipt-printer-encoder.js` maps blocks to commands. `markdown()` works inside table cells and boxes, because it only calls public methods, and every method it calls is allowed there: text, the four styles, `size()`, `rule()`, `table()` and `newline()`. The two things a cell refuses, images and font changes, are not in the subset, and `![alt](src)` prints its alt text so it is safe in a cell too. A pipe table inside a cell is a nested table, which the encoder supports in every combination. This is a requirement, not a side effect: a box with a Markdown body and a table cell with Markdown content are the two ways this method will mostly be used, and the tests below treat them as first class.

**Tests.** `test/markdown.js`: for every row of both tables above, `encoder.markdown(source).encode()` equals the explicit chain, on `esc-pos` and `star-prnt`; the flanking cases (`a * b`, `ORDER_123`, `**unclosed`); nesting; escapes; a table with an empty header, with alignment, and one that is too wide; lists with wrapping, numbering and nesting; the reference receipt below as `test/fixtures/markdown/receipt.md`, checked against the paper as a string and used as the example in `commands.md`; `markdown()` inside a cell and inside a bold context; and the embedded cases as strings of the paper: a box whose content is a callback calling `markdown()` with a heading, a paragraph and a rule, a table cell with `**bold**` and `__underline__` next to a plain cell, a pipe table inside a cell, a heading at double size inside a cell where the widths are measured in the cell's size, and `markdown()` inside a bordered table cell of Section 3 with the border intact.

---

## Part 3: `@point-of-sale/receiptline`

A separate repository and package, published under Apache 2.0. Its parser and layout are receiptline's own code: the `transform` core of `lib/receiptline.js` (the state machine, `parseLine`, `createLine`, `wrapText`, about 34 KB of source) and the measuring helpers of its base command object, vendored, converted to an ES module and modified to fit. The vendored file keeps its copyright header and carries a prominent note that it was changed, the repository ships the Apache licence text, and the README credits the receiptline project. Everything else of receiptline is left behind: the byte backends, the SVG backend, the barcode and QR generators, the stream API, the Node requires and the multibyte encodings.

The reason for vendoring rather than depending on receiptline: its library file requires `iconv-lite`, `pngjs`, `stream` and `string_decoder` at the top of the module, which every bundler ships into a browser build whether the code runs or not, about 200 KB of it, and its API is synchronous where images need to be decoded asynchronously. The vendored core has no dependencies, and being ours it can be made async where it matters.

### Contract

```js
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import { transform } from '@point-of-sale/receiptline';

const encoder = new ReceiptPrinterEncoder({ printerModel: 'epson-tm-t88vi' });

encoder
    .initialize()
    .codepage('auto');

await transform(encoder, document);

const bytes = encoder
    .cut()
    .encode();
```

`transform(encoder, document, options)` queues the receipt onto the encoder and resolves with the encoder. It is async because images have to be decoded. It starts by setting the size to 1 by 1 and the styles off, and leaves the encoder in that state; alignment, font and code page are the application's and are not touched. It never calls `initialize()`, `encode()` or a final `cut()`.

| Option | Default | Meaning |
|---|---|---|
| `cut` | `'partial'` | What a `=` line becomes: `'partial'`, `'full'` or `false` to leave the cuts out |
| `corners` | `'square'` | `'rounded'` prints the rounded corners of receiptline's ESC/POS output. They are printed as text, so the encoder's code page must have them: `codepage('auto')` finds the Epson Katakana page and the Star standard page by itself, a fixed page without them prints question marks |
| `dithering` | `'floydsteinberg'` | The algorithm for images, receiptline's `gradient: true`; `'threshold'` is `gradient: false` |
| `threshold` | `128` | The threshold for images |
| `decode` | platform default | A function from PNG bytes to something `encoder.image()` accepts, for images the default decoder cannot read |

`parse(document)` is exported as well: it returns the parsed lines synchronously, for tools and tests.

### Dependencies and size

- `@point-of-sale/receipt-printer-encoder` as a peer dependency, which the application already has.
- `pngjs` as the only runtime dependency, on the Node side of the conditional exports only. `PNG.sync.read()` returns a plain object with `width`, `height` and an RGBA `data` buffer, which is exactly the generic input `encoder.image()` accepts, verified against the encoder's type detection. The streaming reader returns a `PNG` instance the encoder would reject, so the sync reader is the one to use.
- Nothing in the browser: `createImageBitmap()` decodes the PNG natively, with `colorSpaceConversion: 'none'` and `premultiplyAlpha: 'none'` so that the pixels match Node, and `encoder.image()` accepts the bitmap directly.
- Dev dependencies: `receiptline` and `@point-of-sale/receipt-printer-renderer` for the compatibility tests, mocha and eslint.

The package is about 50 KB of source, roughly 20 KB minified, the same in Node and in the browser, against about 250 KB for receiptline with its dependencies in a browser bundle.

### How the core talks to the encoder

receiptline's layout does not print; it calls a command object with about twenty hooks and concatenates what they return. That seam stays, as an internal interface: the vendored core calls the hooks in document order, the translator implements them on the encoder, and the tests record them. The hooks that matter, and what the translator does with them:

| Hook | Translator |
|---|---|
| `area(left, width, right)`, `align(n)` | Remember the offset of the line. Text lines are always composed at left alignment with the offset as leading spaces; images and codes use `encoder.align()` |
| `absolute(p)`, `relative(n)` | Move a cursor. receiptline prints the vertical rules of a line first and then jumps back to position 1 for the text, which spaces cannot do, so the translator buffers one line as positioned fragments and emits them sorted, with single width spaces in the gaps, when `lf` arrives |
| `ul`, `em`, `iv`, `wh(n)`, `normal` | `underline(true)`, `bold(true)`, `invert(true)`, `size()` from the caret count, and everything off |
| `text(text, encoding)` | `text()`; the encoding argument is ignored, the encoder's code page rules apply |
| `hr(width)`, `vrstart`, `vrstop`, `vrhr(widths1, widths2, dl, dr)` | The border lines as text, composed from `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` and the rounded or square corners, with receiptline's composition of the two layouts at a junction |
| `vr(widths, height)` | A `│` at each boundary at `size(1, height)`, into the line buffer |
| `vrlf(vr)`, `lf` | `lineSpacing('none')` while rules run and `lineSpacing('default')` after, then `newline()` |
| `cut` | `cut(options.cut)`, or nothing |
| `image(image)` | The decoded image, see below, to `image(data, { algorithm, threshold })` |
| `barcode(symbol)` | `barcode(data, symbology, { width: w - 1, height, text: hri })`, with `upc` and `ean` chosen by length, `jan` as `ean`, `nw7` as `codabar` |
| `qrcode(symbol)` | `qrcode(data, { size: cell, errorlevel: level })` |
| `command(text)` | `raw()` with the text as Latin-1 bytes |
| `open`, `close` | Nothing |

The command object approach also gives the vendored core an obvious first modification: the `image` branch of `createLine` awaits the decoder, and `transform` becomes async. No pre-scan, no second pass.

### Sections

**Section 5: Vendor the core.** Copy the transform core and the measuring helpers into `src/core.js` as an ES module with the licence header and the modification note. Remove `createTransform`, `upsideDown`, the multibyte branches of `measureText` and `arrayFrom`, and the `commands` table. Make `transform` async at the image branch. Record the hook calls for every English example document of receiptline into `test/fixtures/<name>.calls.json`, reviewed once by hand, and check the core against them in `test/core.js`. These fixtures are what holds the behaviour fixed while later sections refactor the dense original into house style.

**Section 6: Translator.** `src/translate.js` implements the hooks on the encoder: the line buffer with absolute and relative positioning, the offsets from `area` and `align`, the styles, the vertical rule heights, the border lines with rounded or square corners, the line spacing, cuts, raw commands and the barcode and QR code mapping. `test/translate.js` feeds hand written hook sequences to the translator against a fake encoder that records its calls, and runs every example document through the real encoder in all three languages so that nothing throws.

**Section 7: Images.** `src/image.node.js` with `PNG.sync.read()` and `src/image.browser.js` with `createImageBitmap()`, selected by the conditional exports, and the `decode` override. `test/image.js` decodes the logo of the example documents on Node and checks the pixels the encoder receives.

**Section 8: Compatibility.** Every English example document through this package into an `esc-pos` encoder at 48 columns with `cp437` and `corners: 'rounded'`, and through `receiptline.transform()` with `{ command: 'escpos', cpl: 48, encoding: 'cp437', spacing: true, gradient: false }`, both rendered by the renderer with the `epson` mapping. The papers are cut into ink bands, runs of rows with ink separated by blank rows, and compared band by band, so that different line spacing outside borders does not matter; cuts are compared as items. Documents that cannot match are in an exception list with the reason: the QR code, which receiptline rasterizes and the encoder prints natively, and the underline thickness.

**Section 9: Packaging.** Conditional exports for Node and the browser like the encoder's, the README with usage, the option table, the list of what is not supported (`upsideDown`, `margin`, `marginRight`, `spacing`, `gamma`, the multibyte encodings) and the attribution, `npm test` and `npm run build`.

---

## Order and versions

1. Section 1, 2, 3 on the encoder, in that order, each committed on its own. Section 3 depends on both.
2. Section 4 on the encoder.
3. The package repository, Sections 5 to 9, after 4.0.0 is published, because the package depends on it from npm.

The encoder work is part of the ongoing 4.0.0 development and ships with it. Every section adds its entry under "New in version 4" in `documentation/changes.md`, and the line spacing change of Section 2 does not need a migration note, because no released version has the old behaviour of `box()`.

## Open decisions

- **Rows with their own columns in `table()`.** Left out: spanned cells cover the common need, a header or total row that runs across columns, and the junction code of Section 3 already handles differing boundaries, so a row with its own layout could be added later without new drawing code. Not needed by anything in this plan.
- **Rounded corners in the package.** They are printed as text and depend on the encoder's code page having the glyphs. A small `codepages` getter on the encoder, listing the pages of its mapping, would let the package fall back to square corners by itself instead of printing question marks. Not in this plan.
- **The name of the rule row.** `{ rule: true }` is the proposal. The alternative `'-'` as a row is shorter and untyped.
- **`markdown()` newlines.** A newline is a newline, as proposed, or Markdown's soft break that joins lines with a space. The proposal is the first; it matches how receipts are written and how GitHub renders comments.
- **`__text__` as underline and `==text==` as invert.** Both deviate from or extend GFM. The alternative is to have no underline and no invert in Markdown, which makes the method much less useful on a receipt.
- **Repository name for the package.** `ReceiptLine` under Dependencies, published as `@point-of-sale/receiptline`, or `ReceiptLineEncoder` to keep clear of the receiptline project's own repository name.
- **House style.** Whether the vendored core is rewritten into the encoder's style section by section under the recorded fixtures, or kept as it is and only modified where needed. The recommendation is to rewrite it gradually: the original is dense, and every later change has to be understood against it.
- **A `lineSpacing` option on the encoder**, so that a document can print without line spacing the way receiptline does by default. Not in this plan, noted as a follow-up.
