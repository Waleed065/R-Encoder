# Known bugs

Open problems with an analysis and a candidate fix, waiting for a release. All entries below are planned for 4.0.1. The first two have not been verified on the printer that reported them, so the reply to the reporter should ask for confirmation.

<br>

## #42 Alignment is lost below an image on the Everycom EC400

https://github.com/at-point-of-sale/ReceiptPrinterEncoder/issues/42, a follow-up of #15, reported by rajinikanth0601.

### Symptoms

Text after an image comes out right aligned instead of left, and the image itself ignores its alignment. Sending a raw `ESC a` command after the `image()` call fixes the text, which shows the printer handles the command itself. Reproduced on the Everycom EC400, not on a Shreyans printer, and not on any of the printers used for testing here.

### Analysis

Text lines are aligned with spaces, but images, barcodes, QR codes and PDF417 codes are aligned with `ESC a`, sent before the block and reset to left after it. For a right aligned image followed by a left aligned line, 3.0.3 and 4.0.0 send identical bytes:

```
<ALIGN right><RASTER image><ALIGN left>⏎
Text with left alignment 2⏎
```

The reset arrives after the image data but before the line feed. Epson's reference says `ESC a` is only processed at the beginning of a line, so this order relies on the raster command ending the line by itself. Epson printers do that, the EC400 does not: it drops the reset as mid-line and applies the pending right alignment to the next text line. The reporter's raw command workaround worked because it came after the line feed.

### Candidate fix

Send the reset after the line feed. In `src/receipt-printer-encoder.js` the four block commands, `image()`, `barcode()`, `qrcode()` and `pdf417()`, all follow the same pattern: set the alignment, add the block, add the reset, flush. Flush the block first and add the reset as a separate line afterwards. Lines that contain only state changes get no line feed, so no empty line appears, and the output for printers that follow the spec is functionally unchanged. With `feedAfterBlock: false` the line feed is skipped and the reset follows the block data directly, as it does now.

The byte order changes for every aligned block, so the recorded output of the image, barcode and QR code tests needs updating.

<br>

## #16 Content below a raster image is corrupted on the Everycom EC400

https://github.com/at-point-of-sale/ReceiptPrinterEncoder/issues/16, reported by rajinikanth0601.

### Symptoms

In raster mode the image prints, but the content below it is missing on the first print and comes out as garbage on the second. Column mode works at every height. Raster mode fails for image heights of 288 and 432 dots and works for some smaller heights.

### Analysis

The raster command `GS v 0` carries the row count as two bytes, low and high, and `src/languages/esc-pos.js` sends the whole image in one command. Heights up to 255 have a high byte of 0. A height of 288 has a high byte of 1 and a low byte of 32, a height of 432 a high byte of 1 and a low byte of 176.

A firmware that ignores the high byte, or caps a raster command at 255 rows, reads 288 as 32 rows and 432 as 176 rows. It prints those rows, then interprets the rest of the pixel data as text and commands. That produces corrupted text after a partial image, and random bytes can leave the printer in a state where nothing prints until it is reset, which matches the empty first print. Every height the reporter saw working is below 256.

python-escpos splits raster images into fragments by default, with a note about printer buffer limits, so this class of firmware is known elsewhere.

### Candidate fix

Split the raster output into chunks of at most 255 rows, in the raster branch of `image()` in `src/languages/esc-pos.js`. A raster command prints exactly its rows and stops, so consecutive commands join without a seam on printers that follow the spec. The bytes only change for images taller than 255 dots. The height passed to the command must be the height of the chunk, and the row data sliced accordingly, so the last chunk can be shorter.

The recorded output of tests with tall raster images needs updating. A test with an image of 288 rows should check that two commands are sent, of 255 and 33 rows.

<br>

## Redundant code page commands with automatic code page selection

No issue on GitHub, noticed by Niels on 2026-09-17.

### Symptoms

With `codepage('auto')` every line, and every text fragment within a line, starts with a code page command, also when the page is the same as the one the printer already has. Four accented lines produce four `ESC t 0` commands. A table sends one per row, and a line with bold toggles sends one per fragment. With an explicit code page the command is sent once, when the page changes.

### Analysis

`#encodeText()` in `src/receipt-printer-encoder.js` has two paths. The explicit path compares the page of the text with `#state.codepage` and only emits a command when it differs. The automatic path loops over the fragments from `CodepageEncoder.autoEncode()` and emits a code page command for every fragment unconditionally, while still updating `#state.codepage`. Version 3.0.3 does the same. Nothing prints wrong, the output is just longer than it needs to be, which is the kind of waste the 4.0.0 style deduplication removed everywhere else.

The state tracking the explicit path relies on is reset by `initialize()` and updated by both paths, so the automatic path can rely on it too.

### Candidate fix

In the automatic path, emit the code page command only when `#state.codepage` differs from the page of the fragment, the same test the explicit path uses. Tried in a throwaway worktree: all 576 tests pass unchanged, so no recorded output depends on the repeated commands. With the change, four accented lines send one command, a switch to Greek and back sends one per switch, and tables and boxes send one at their first text. Mixing an explicit page with `auto` afterwards still switches correctly, since both paths share the state.
