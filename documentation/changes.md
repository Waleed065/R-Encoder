# ReceiptPrinterEncoder
**Formally known as EscPosEncoder, StarPrntEncoder and ThermalPrinterEncoder**

<br>

Create a set of commands that can be send to any receipt printer that supports ESC/POS, StarLine or StarPRNT.

- [About ReceiptPrinterEncoder](../README.md)
- [Usage and installation](usage.md)
- [Configuration options](configuration.md)
- [Handling text](text.md)
- [Commands for creating receipts](commands.md)
- [Printing receipts](printing.md)
- [Migrating from version 3 to version 4](#migrating-from-version-3-to-version-4)
  - [Initialize must come first](#initialize-must-come-first)
  - [Tables and boxes inherit styles and sizes](#tables-and-boxes-inherit-styles-and-sizes)
  - [Newlines in text](#newlines-in-text)
  - [Whitespace is kept when wrapping](#whitespace-is-kept-when-wrapping)
  - [No line feed after commands that only change state](#no-line-feed-after-commands-that-only-change-state)
  - [Fewer and different bytes](#fewer-and-different-bytes)
  - [Stricter validation](#stricter-validation)
  - [New in version 4](#new-in-version-4)
- [Migrating from version 2 to version 3](#migrating-from-version-2-to-version-3)
  - [New name](#new-name)
  - [Standalone](#standalone)
  - [Default language](#default-language)
  - [Dependency on canvas removed](#dependency-on-canvas-removed)
  - [Wrap parameter for text() and line() removed](#wrap-parameter-for-text-and-line-removed)
  - [Width parameter renamed to columns and now has a default value](#width-parameter-renamed-to-columns-and-now-has-a-default-value)
  - [Alignment now uses spaces](#alignment-now-uses-spaces)
  - [Size() changed functionality](#size-changed-functionality)
  - [Qrcode() now uses a configuration object](#qrcode-now-uses-a-configuration-object)
  - [Barcode() now uses a configuration object](#barcode-now-uses-a-configuration-object)
  - [Barcode() default size changed](#barcode-default-size-changed)
  - [Codabar and NW-7 barcodes are the same](#codabar-and-nw-7-barcodes-are-the-same)
  - [Code-128 code sets are no longer supported](#code-128-code-sets-are-no-longer-supported)
  - [Some code page mappings have been renamed](#some-code-page-mappings-have-been-renamed)
  - [Automatic encoding of codepages](#automatic-encoding-of-codepages)

<br>

## Migrating from version 3 to version 4

The API of version 4 is the same as version 3, but the behaviour of a number of commands has changed, some of them in ways that alter the bytes your receipts produce and what ends up on paper. If you compare output byte for byte, or rely on one of the behaviours below, read this section before upgrading.

<br>

### Initialize must come first

`initialize()` now has to be the first command, or come directly after an `encode()`. Calling it in the middle of a receipt throws an error. The initialize command resets the printer, which would silently discard everything that was queued before it, so this was never useful. The command is also sent on a line of its own, so that alignment padding for the first line no longer ends up before the reset and gets cleared by it.

<br>

### Tables and boxes inherit styles and sizes

The cells of a table and the contents of a box now start with the bold, italic, underline and invert style of the encoder, and with its text size. In version 3 they started from the default style, so a cell that set a style reset it at its end and cancelled the style of the table for the rest of the row.

Column widths are counted in characters of the size that is active when the table is created. A column of 10 in a table at double size fits 10 double width characters, and the whole table prints at that size. Setting a style inside a cell that the cell already inherits is a no-op, turning it off applies to that cell only, and a toggle is relative to the inherited style. Tables and boxes at single size in the default style produce the same output as before.

The padding of table cells and the margins of boxes are no longer trimmed on right aligned lines, which shifted a full width right aligned table by one column in version 3.

<br>

### Newlines in text

A newline character in `text()` ends the current line, and the text after it continues on the next line, also when that text comes from a later call. In version 3 every empty segment fed the paper, so `text('')` fed once, `line('')` fed twice, and `text('a\n')` was followed by an empty line. An empty text now does nothing, `line('')` feeds once, and the text after the last newline stays on the line.

<br>

### Whitespace is kept when wrapping

The text wrapper used to drop all whitespace at the start of a line, which removed explicit indentation as well as the separator between words, and treated non-breaking spaces as whitespace. Whitespace is now classified by its position: whitespace between two words is a separator that becomes the line break when the next word wraps, whitespace before the first word of a text is literal indentation, whitespace after the last word is kept, and non-breaking spaces are part of words.

<br>

### No line feed after commands that only change state

Lines that contain nothing printable, such as a pending style, font or alignment change flushed before an image, barcode, QR code or cut, are no longer followed by a line feed. In version 3 this printed an empty line before such blocks and, for the trailing style reset, at the end of the receipt. Explicit `newline()` calls still feed.

A lone `raw()` call is no longer followed by a line feed either. If your raw bytes contain printable data, add the newline yourself.

Images, barcodes, QR codes and PDF417 codes advance the paper by themselves and are still followed by a line feed by default, as they were in version 3. Set the new `feedAfterBlock` option to `false` to print the content that follows directly below the block.

<br>

### Fewer and different bytes

The encoder no longer sends style commands that set a property to the value the printer already has, and collapses consecutive changes of the same property into the last one. Lines without text, spaces or raw data get no style commands at all. Nothing changes on paper, but the byte output is shorter than in version 3 and differs from it.

Column mode images set the vertical motion unit explicitly when the printer model is known, so that the 24 dot strips of an image join up on every printer. On Epson printers the strips used to overlap by 6 dots, on printers with a one dot motion unit there was a 12 dot gap.

A font change before a centred or right aligned line is sent before the padding of that line. In version 3 the spaces came first, so the printer padded the line in the width of the previous font and the text landed off centre.

The ESC/POS command for GS1-128 barcodes used a wrong symbology byte, which printed a Code 93 barcode instead. Pulse timings are clamped to the range the printer accepts.

<br>

### Stricter validation

A table wider than the paper, including its margins and the current character width, throws a descriptive error instead of producing garbage or a `RangeError`. Column and box widths must be positive integers. The `align` property of columns and boxes is validated. In version 3 some of these cases printed wrong output or threw an unclear error.

A row of a table has to be an array of cells, or a rule row, which is an object with a `rule` property set to `true`. Anything else throws. A string as a row used to print one character per column in version 3, because a string is indexed like an array.

<br>

### New in version 4

- `image()` accepts an options object with `width`, `height`, `algorithm` and `threshold`. A missing width or height follows from the other one and the size of the image, keeping the aspect ratio, and an image without either keeps its own size, scaled down when it is wider than the paper. The separate parameters still work.
- The `printableWidth` getter returns the width of the print area in dots, based on the number of columns and the width of font A.
- Table columns without a `width`, or with `width: 'auto'`, are fill columns that take the space that is left on the line.
- The `overflow` property of a column controls what happens with text that does not fit on one line of the cell: `wrap`, `clip` or `ellipsis`.
- `table()` takes a third parameter with options: `outline`, `border`, `corners`, `rules` and `width`. The `outline` is the frame around the table and the `border` the lines between its cells, both `none`, `single` or `double` and independent of each other, so `outline: 'single', border: 'single'` is a framed table with dividers. A table with lines counts every vertical rule in its width and prints without line spacing so that the rules of consecutive lines touch. The `outline`, `corners` and `width` options read the same as the options of `box()`.
- A frame and the lines inside it can have a different style. The junctions where the two meet are drawn with the glyphs of cp437 that join a single line to a double one, `╤ ╥ ╧ ╨ ╞ ╟ ╡ ╢ ╪ ╫` and the corners `╒ ╓ ╕ ╖ ╘ ╙ ╛ ╜`, so every combination connects.
- A row of a table can be `{ rule: true }` instead of an array of cells, which draws a horizontal rule between the rows around it, in the style of the `border` option, or single when there are no dividers. In a bordered table the rule connects to the vertical rules above and below it. The `rules` option draws one between every pair of rows, and rules never double up with the outline or with each other.
- A cell of a table can be an object with a `content`, a `span` and an `align` property, which lets it span several columns. It is as wide as the columns it covers, the margins between them and the vertical rules it swallows, and behaves like a plain cell of that width.
- A cell of a bordered table can turn its own border off with a `border` property, either entirely with `none` or per side with an object with any of `top`, `right`, `bottom` and `left` set to `none`. An edge is drawn when either of the cells next to it wants it, a rule that is not drawn keeps its column as a space, and a horizontal line that comes out blank is not printed at all. A cell can only turn its border off, any value that is not `none` or a style the table itself draws with throws.
- The `outline` option of `table()` is the frame around the whole table: a style for every side, or an object with any of `top`, `right`, `bottom` and `left` set to a style, where the sides that are left out are `none`. It is `none` by default, so `border: 'single'` with `rules: 'all'` gives a grid of lines between the cells without a frame around it. A vertical rule only has a column of its own where the table draws one, an outer rule where that side of the outline is drawn and a divider when the table has a border, so a fill column takes the characters that are left.
- A cell of a table can override the margins of its column with a `marginLeft` and a `marginRight` property. The cell keeps the width of the columns it covers, so its margins take their characters from its contents and every row stays as wide as the table.
- The `width` option of `table()` makes a table narrower than the paper. It is positioned by the current alignment, so `align('center')` with a `width` gives a centered table.
- The `corners` option of `box()` draws the corners of a single line border rounded, on printers that have a code page with the glyphs, which are the Epson compatible and the Star printers. The option of `table()` does the same for a single outline.
- The border option of `box()` is now called `outline` instead of `style`, because it is not a text style and it reads the same as the option of a table. The old name still works, and when both are given `outline` wins.
- The `lineSpacing()` command changes the distance the paper is fed after every line, either the `default` of the printer or `none`. A bordered box prints without line spacing, so the vertical lines of its border touch instead of leaving a gap on every line, which changes the bytes of every box with a border compared to version 3.
- The `markdown()` command prints a subset of GitHub Flavored Markdown: headings, rules, pipe tables, lists, bold, underline, italic, invert, links and images. It has no options, everything it prints goes through the commands the encoder already has, and it works inside table cells and boxes.
- The `receiptline()` command prints a receiptline document, with the layout provided by the [`@point-of-sale/receiptline`](https://github.com/at-point-of-sale/ReceiptLine) package through the new `receiptline` option. It is the one asynchronous command.
- `image()` accepts an `ImageBitmap` in the browser, for example from `createImageBitmap()`.
- The `feedAfterBlock` option, see above.
- The `gs1-128` barcode symbology.
- The `text` option of `barcode()` names where the human readable text goes: `none`, `above`, `below` or `both`. The booleans still work, `true` is `below` and `false` is `none`. Star printers print the text below or not at all.
- Printer definitions for the SUNMI built-in printers and their codepage mapping, and for the Bluetooth cat printers, which print through [ReceiptPrinterRenderer](https://github.com/at-point-of-sale/ReceiptPrinterRenderer).
- TypeScript declarations are bundled with the package.
- The width of double width characters is calculated correctly when a line mixes sizes, and the font lookup no longer throws for printer models without a size for a font.

<br>

## Migrating from version 2 to version 3

ReceiptPrinterEncoder has been completely rewritten in version 3, but we've attempted to keep the API backwards compatible. And for the most part that is true, except when dealing with images in Node. See below for the details.

<br>

### New name

ReceiptPrinterEncoder was previously named ThermalPrinterEncoder. This name was changed to be more consistant with its sister libraries. Also we're now moving to a single scope for all Point-Of-Sale related libraries.

Version 2:

    npm i thermal-printer-encoder

Version 3:

    npm i @point-of-sale/receipt-printer-encoder

<br>

### Standalone

Previously this library had a dependancy on EscPosEncoder and StarPrntEncoder. That is no longer the case, as this library can now encode both ESC/POS, StarLine and StarPRNT by itself. That means there is less duplicated code and our bundle size can be quite a bit smaller.

If you are still using EscPosEncoder or StarPrntEncoder, the dependancy is now the other way around. EscPosEncoder and StarPrntEncoder have been updated to use ReceiptPrinterEncoder as a dependency and it is advised to use ReceiptPrinterEncoder instead.

<br>

### Default language

In previous versions of this library you had to specify a language, such as `esc-pos` or `star-prnt`. If you did not specify the language, you would get an exception. In the latest version the langauge will default to `esc-pos`.

<br>

### Dependency on canvas removed

When using Node, this library previously had a dependency on the `canvas` package for dealing with images. In version 3 we've made this library more lightweight and flexible by removing this dependency, allowing you to use other libraries as well. 

However, if you want to continue using the `canvas` package for images, you now have to handle the dependency yourself. 

This only applies if you provide the image as an `Image` object. If you make your own image and provide a `Canvas` object, you do not need to make any modifications.

Version 2:

```js
import { loadImage } from 'canvas';
import ThermalPrinterEncoder from 'thermal-printer-encoder';

let image = await loadImage('image.png');

let encoder = new ThermalPrinterEncoder();

encoder.image(image, ...)
```

Version 3:

```js
import { createCanvas, loadImage } from 'canvas';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

let image = await loadImage('image.png');

let encoder = new ReceiptPrinterEncoder({ 
    createCanvas 
});

encoder.image(image, ...)
```

If all you want to do is print already existing image files, you might even want to move away from `canvas` altogether to a more lightweight image library. There are examples on how to use various libraries in the `examples` directory.

<br>

### Wrap parameter for text() and line() removed

It is no longer possible to specify the number of columns after which to wrap when using the `text()` or `line()` command. Instead you could use the `box()` function with a border style of `none`.

Version 2:

```js
encoder
    .text('... a long block of text ...', 30)
```

Version 3:
```js
encoder
    .box(
        { width: 30, style: 'none' }, 
        '... a long block of text ...'
    )
```

<br>

### Width parameter renamed to columns and now has a default value

The `width` parameter has now been changed to the `columns` parameter. The `width` parameter still works, but is deprecated and will be removed in future releases. 
In previous versions this parameter did not have a default value, but that is now set to 42 characters.

<br>

### Alignment now uses spaces

In previous version of this library, we used the build-in alignment functionality of the printer to create right aligned or centered text. This has been changed in version 3. From now on we always use left aligned text and align the text ourselves inserting spaces before the text. This allows us to control word wrapping better and also works in tables and boxes.

Images and barcodes still use the build-in alignment of the printer.

<br>

### Size() changed functionality

In version 2 you could call `size()` with the parameter `normal` or `small` to change the font size. This functionality has now been moved to the `font()` function. 

Version 2:

```js
encoder
    .size('small')
    .text('This is small text')
```

Version 3:

```js
encoder
    .font('B')
    .text('This is small text')
```

In addition to this, the `size()` function is now a shortcut for the `width()` and `height()` functions allowing you to change the width and height with just one command.

Version 2:

```js
encoder
    .width(2)
    .height(2)
    .text('This is big text')
```

Version 3:

```js
encoder
    .size(2)
    .text('This is big text')
```

The old way of using the `size()` function still works, but it has been deprecated and will be removed in a future version.

<br>

### Qrcode() now uses a configuration object

Instead of seperate parameters for model, size and errorlevel, the `qrcode()` function now uses a configuration object to set the model, size and errorlevel.

Version 2: 

```js
let result = encoder
    .qrcode('https://nielsleenheer.com', 1, 8, 'h')
    .encode()
```

Version 3: 

```js
let result = encoder
    .qrcode('https://nielsleenheer.com', { model: 1, size: 8, errorlevel: 'h' })
    .encode()
```

The old way of using the `qrcode()` function still works, but it has been deprecated and will be removed in a future version.

<br>

### Barcode() now uses a configuration object

Instead of a seperate parameter for height, the `barcode()` function now uses a configuration object to set the height and a couple of new options..

Version 2: 

```js
let result = encoder
    .barcode('313063057461', 'ean13', 40)
    .encode()
```

Version 3: 

```js
let result = encoder
    .barcode('313063057461', 'ean13', { height: 40 })
    .encode()
```

The old way of using the `barcode()` function still works, but it has been deprecated and will be removed in a future version.

<br>

### Barcode() default size changed

There was an inconsitency in size of the barcode between StarPRNT and ESC/POS. The barcodes printed on a Star printer appeared much larger. This inconsistency has been fixed and Star printers now appear similar to ESC/POS printers. 

Additionally a new `width` option has been added so you can adjust the size of the barcode yourself.

<br>

### Codabar and NW-7 barcodes are the same

In previous versions ESC/POS printers supported Codabar barcodes and Star printers supported NW-7 barcodes. On most printers these types are completely identical. 

So from now on Codabar is supported for ESC/POS and StarPRNT and NW-7 is an alias for Codabar. And it is no longer needed to choose one for one language and pick the other one for the other language. Both will work in both languages.

<br>

### Code-128 code sets are no longer supported 

Version 2 allowed you to specify which code set you wanted to use for Code-128 barcodes. This functionality has been deprecated, because it did not work correctly in StarPRNT. As of version 3, the code set will be automatically selected for both languages.

<br>

### Some code page mappings have been renamed

The previous version of this library had an optional code page mapping with the name of `zijang`. This has been renamed to `pos-5890` to match the model number of this device. 

<br>

### Automatic encoding of codepages

In previous versions of this library it supported automatic encoding of codepages using a limited set of codepages:

`cp437`, `cp858`, `cp860`, `cp861`, `cp863`, `cp865`, `cp852`, `cp857`, `cp855`, `cp866`, `cp869`

The current version still supports automatic encoding, except that it no longer uses a fixed set of codepages, unless you manually specify one using the `codepageCandidates` property. Instead it will now use all codepages supported by the printer to encode characters from.
