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
    - [Table](tables-and-boxes.md#table)
    - [Box](tables-and-boxes.md#box)
  - [Rule](commands.md#rule)
  - [Markdown and ReceiptLine](markup.md)
    - [Markdown](#markdown)
    - [ReceiptLine](#receiptline)
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

## Markdown and ReceiptLine

The `markdown()` and `receiptline()` commands print a whole document written in a markup language instead of building it up command by command. Markdown is built in, receiptline needs the separate [`@point-of-sale/receiptline`](https://github.com/at-point-of-sale/ReceiptLine) package. Both commands are part of the [commands for creating receipts](commands.md) and this chapter describes them in detail.

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

Italic is not supported by most ESC/POS printers and not at all by StarPRNT printers, see the [italic](commands.md#italic) command.

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

Print a [receiptline](https://github.com/receiptline/receiptline) document, the receipt markup language of the OpenReceipt project. The layout is not part of this library: it comes from the [`@point-of-sale/receiptline`](https://github.com/at-point-of-sale/ReceiptLine) package, which you give to the encoder with the `receiptline` option when you create it. See [the configuration options](configuration.md#receiptline).

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

The second parameter is an object with the options of the package, such as `cut` for what a cut line becomes and `corners` for rounded corners; see the [documentation of `@point-of-sale/receiptline`](https://github.com/at-point-of-sale/ReceiptLine) for all of them. The document positions everything itself, so it prints at left alignment and in the plain style, and it leaves the encoder that way. The final cut is yours to add.

Without the option the command throws. It is not available in table cells and boxes.

<br>
