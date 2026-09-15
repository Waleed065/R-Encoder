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
    - [Markdown](markup.md#markdown)
    - [ReceiptLine](markup.md#receiptline)
  - [Barcodes](barcodes.md)
    - [Barcode](#barcode)
    - [Qrcode](#qrcode)
    - [PDF417 code](#pdf417-code)
  - [Image](commands.md#image)
  - [Pulse](commands.md#pulse)
  - [Cut](commands.md#cut)
  - [Raw](commands.md#raw)
- [Printing receipts](printing.md)
- [Migrating from version 3 to version 4](changes.md)
- [Migrating from version 2 to version 3](changes.md#migrating-from-version-2-to-version-3)

<br>

## Barcodes

The `barcode()`, `qrcode()` and `pdf417()` commands print one and two dimensional codes. What each printer supports depends on its model and language. A code the printer does not support is not printed, or comes out as its raw data, depending on the manufacturer. All three commands are part of the [commands for creating receipts](commands.md) and this chapter describes them in detail.

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
