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
  - [Tables and boxes](tables-and-boxes.md)
    - [Table](tables-and-boxes.md#table)
    - [Box](tables-and-boxes.md#box)
  - [Rule](#rule)
  - [Markdown and ReceiptLine](markup.md)
    - [Markdown](markup.md#markdown)
    - [ReceiptLine](markup.md#receiptline)
  - [Barcodes](barcodes.md)
    - [Barcode](barcodes.md#barcode)
    - [Qrcode](barcodes.md#qrcode)
    - [PDF417 code](barcodes.md#pdf417-code)
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

Insert a table with multiple columns. See [Tables and boxes](tables-and-boxes.md#table).

<br>

### Box

Insert a bordered box. See [Tables and boxes](tables-and-boxes.md#box).

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

Print a subset of GitHub Flavored Markdown. See [Markdown and ReceiptLine](markup.md#markdown).

<br>

### ReceiptLine

Print a receiptline document, the receipt markup language of the OpenReceipt project. See [Markdown and ReceiptLine](markup.md#receiptline).

<br>

### Barcode

Print a barcode of a certain symbology. See [Barcodes](barcodes.md#barcode).

<br>

### Qrcode

Print a QR code. See [Barcodes](barcodes.md#qrcode).

<br>

### PDF417 code

Print a PDF417 code. See [Barcodes](barcodes.md#pdf417-code).

<br>

### Image

Print an image. The image is automatically converted to black and white and can optionally be dithered using different algorithms.

The first parameter is the image itself. 

When running in the browser it can be an `ImageData` object, an `ImageBitmap`, or any element that can be drawn onto a canvas, like an `<img>`, `<svg>`, `<canvas>` or `<video>` element. 

When using Node you have multiple options:

- First of all, you can provide an `ImageData` object, which many libraries can export, such as `@canvas/image`, `canvas`, `png-js` and `image-pixels`.

- You can also provide raw pixel data provided by other common libraries, such as `readimage`, `sharp`, `pngjs` and `get-pixels`.

- And finally you can provide a `Canvas` or `Image` object used by the `canvas` library. However, if you provide an `Image` object the library needs to convert it to a canvas and for that you need to provide a `createCanvas` function when instantiating the encoder (In previous versions you did not need to do this, because the `canvas` library was a dependency, but in recent versions this has become an optional dependency).

The second parameter is an object with options for the size of the image on the paper and for dithering:

- *width* - the width of the image on the paper in dots. The image is resized to this width.
- *height* - the height of the image on the paper in dots. The image is resized to this height.
- *algorithm* - the dithering algorithm that is used to turn colour and grayscale images into black and white. The following algorithms are supported: `threshold`, `bayer`, `floydsteinberg` and `atkinson`. If not supplied, it will default to a simple threshold.
- *threshold* - the threshold that will be used by the threshold and bayer dithering algorithm. It is ignored by the other algorithms. It is set to a default of 128.
- *mode* - the ESC/POS command that is used to send this image, `column` or `raster`. It defaults to the `imageMode` option of the encoder, or the mode of the printer model. Star printers have one image command and ignore this option.

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

Or on the web with an `ImageBitmap`, which the browser decodes for you from a `Blob`, for example the response of a `fetch()`:

```js
let encoder = new ReceiptPrinterEncoder();

let response = await fetch('https://...');
let bitmap = await createImageBitmap(await response.blob());

let result = encoder
    .image(bitmap, { width: 320, algorithm: 'atkinson' })
    .encode();
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
> If you are trying to print an image on an ESC/POS printer and it does not work properly, you can try changing the image mode in the [configuration settings](configuration.md#image-mode), or for one image with the `mode` option. Some printers only support `raster` mode, other printers only support `column` mode.

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
