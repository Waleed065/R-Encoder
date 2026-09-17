# Implementation plan: version 4.0.1

Three fixes, all analysed in `KNOWN-BUGS.md` in the root of the repository: redundant code page commands in automatic mode, raster images taller than 255 rows on firmware that ignores the high byte of the row count, and the alignment reset after a block that lands before the line feed. None of them changes the API. Two of them change the bytes for existing receipts, so this is a patch release with a note in the changelog, not a silent one.

The sections are ordered from the smallest and safest change to the one that touches the most recorded test output. Each section follows the usual orchestration: an implementation agent, a bug-check agent, a review, one commit per accepted section. Nothing is pushed until the release section is done.

Every section delivers code in `src/`, tests in `test/` that run without the `canvas` native module, and a clean `npm run lint`. The documentation and the changelog are written once, in Section 4, so that the three changes are described together.

Baseline before Section 1: 576 tests passing, version 4.0.0, working tree clean apart from `KNOWN-BUGS.md`.

---

## Section 1: One code page command per change in automatic mode

### What changes

`#encodeText()` in `src/receipt-printer-encoder.js` has two paths. The explicit path, for a code page set with `codepage('cp850')` and the like, compares the page of the text with `#state.codepage` and emits `ESC t` only when it differs. The automatic path, for `codepage('auto')`, loops over the fragments that `CodepageEncoder.autoEncode()` returns and emits a code page command for every fragment, whether the page changed or not, while updating `#state.codepage` all the same.

The automatic path gets the same test as the explicit path: a fragment emits a code page command only when `#state.codepage` differs from the page of the fragment. The state is updated in the same place. Nothing else moves.

### Why this is safe

`#state.codepage` starts at -1, is reset to -1 by `initialize()`, and is written by both paths whenever a command goes out. The explicit path has relied on it since version 3. A receipt that mixes an explicit page with `auto` afterwards still switches correctly because both paths read and write the same state.

The change was tried in a throwaway worktree on 2026-09-17: all 576 tests pass without any modification, so no recorded output depends on the repeated commands.

### What the output looks like afterwards

- Four lines of accented Latin text in `auto` mode: one `ESC t 0` before the first line, none before the others. Today: four.
- A Greek line, a Latin line and a Greek line: three commands, one per switch. Unchanged in count, this case never repeated within a page.
- A line with bold toggled around fragments: one command for the line. Today: one per fragment.
- A table or a box with accented text: one command at the first text, none per row. Today: one per row.
- An explicit `cp850` line followed by `auto` Latin text: `ESC t 2` then `ESC t 0`. Unchanged.
- A second receipt after `encode()` and `initialize()`: the command is sent again, because the state is reset. Unchanged.

### Tests

New test file `test/codepage-auto.js`, or a new `describe` in `test/language-esc-pos.js` next to the existing `codepage(auto).text(héψжł)` case, covering the six cases above on ESC/POS, and the first and second case on StarPRNT, where the command is `ESC GS t n`. The assertions compare whole byte arrays, in the style of the existing tests, not counts.

The existing `codepage(auto).text(héψжł)` tests must pass unchanged: every fragment there is in a different page, so every fragment still gets its command.

### Acceptance

- 576 existing tests pass unchanged, plus the new ones.
- `encode()` output for a receipt with an explicit code page is byte for byte what 4.0.0 produces.
- The `commands` and `lines` output formats no longer carry the redundant `codepage` items either, which is the same change seen from the other side, and is fine.

---

## Section 2: Raster images in chunks of at most 255 rows

### What changes

The raster branch of `image()` in `src/languages/esc-pos.js` sends the whole image in one `GS v 0` command, with the row count as a low and a high byte. A firmware that ignores the high byte, or caps a command at 255 rows, prints the first `height mod 256` rows and interprets the rest of the pixel data as text and commands. That is issue #16.

The raster branch splits the image into chunks of at most 255 rows and sends one `GS v 0` command per chunk, each with the chunk's own row count and only the rows of that chunk. The last chunk can be shorter. Images of 255 rows or fewer produce exactly the bytes they produce today, one command.

Column mode already works this way, one `ESC *` command per 24 dot strip, each as an `image` item of its own with `height: 24`. The raster chunks follow that precedent: one `image` item per chunk, `property: 'data'`, `value: 'raster'`, `width` the full width, `height` the height of the chunk. Consumers of the `commands` and `lines` formats that sum the heights of the items get the height of the image, as they do for column mode.

### Details

- The chunk size is a constant in `esc-pos.js`, `255`, with a comment that names the reason: firmware that reads only the low byte of the row count. It is not an option. 255 is the largest value that keeps the high byte at 0, and 256 would send a high byte of 1 with a low byte of 0, the worst case for that firmware.
- The image is already padded to a multiple of 8 rows before it reaches the language layer, so a chunk boundary never falls inside a byte row. Chunks are cut on row boundaries, not on multiples of 8: 255 is not a multiple of 8 and does not need to be, `GS v 0` takes any row count.
- `getRowData()` gets a start row and a row count, or the caller slices the array it returns, whichever reads better. The bytes per row are `width >> 3`, so a chunk of `n` rows starting at row `s` is the slice from `s * (width >> 3)` to `(s + n) * (width >> 3)`.
- A raster command prints its rows and stops, without a line feed, so consecutive chunks join without a seam on printers that follow the specification. There is no line spacing or motion unit to set, unlike column mode. The line feed after the block, controlled by `feedAfterBlock`, comes once after the last chunk, as it does today, because the chunks are items on the same line and `LineComposer.isBlock()` still sees a line of block items only.
- Star languages are not touched. Their image command already sends 24 dot strips.

### Tests

In `test/image.js`, a new `describe` for raster mode with an 8 dot wide white image:

- 8 rows: one command, byte for byte today's output.
- 255 rows: one command with `yL = 255`, `yH = 0`.
- 256 rows: two commands, 255 rows and 1 row.
- 288 rows: two commands, 255 and 33, which is the reporter's first failing height.
- 512 rows: three commands, 255, 255 and 2.
- 288 rows with `feedAfterBlock: false`: two commands and no line feed after them.
- A 16 dot wide image of 260 rows with a black pixel in the last row: the last chunk carries that pixel, which proves the slice offsets are right.

Existing tests with raster images taller than 255 rows, if any, need their recorded bytes updated. The tests in `test/feed-after-block.js`, `test/image-sizing.js` and `test/language-esc-pos.js` use small images and should pass unchanged; the implementation agent reports which tests changed and why, and the review checks that every change is a tall image.

### Acceptance

- Every image of 255 rows or fewer encodes byte for byte as in 4.0.0.
- The `commands` format for a tall raster image shows one `image` item per chunk with the chunk height.
- The renderer in `../ReceiptPrinterRenderer` draws a receipt with a 288 row raster image from the new bytes as one image without a gap. This is a manual check with its `npm run contact-sheet` or a small script, not a test in this repository.

---

## Section 3: The alignment reset after a block follows the line feed

### What changes

Images, barcodes, QR codes and PDF417 codes are aligned with the printer's own alignment command, `ESC a` on ESC/POS and `ESC GS a` on Star, because they cannot be padded with spaces. The four commands in `src/receipt-printer-encoder.js`, `image()`, `barcode()`, `qrcode()` and `pdf417()`, all do the same thing: flush what is pending, add the alignment command when the composer's alignment is not left, add the block, add the reset to left when the alignment is not left, flush. The result is

```
ESC a 2, block data, ESC a 0, LF
```

Epson's reference says the alignment command is processed at the beginning of a line only. The reset here arrives after the block data and before the line feed, which is mid-line on a printer that does not treat the block as ending the line. Epson printers do treat it that way. The Everycom EC400 does not: it drops the reset and applies the pending right alignment to the next text line. That is issue #42, and the reporter's workaround, a raw reset after the `image()` call, worked because it came after the line feed.

The reset moves after the line feed. Each of the four commands flushes the line with the alignment command and the block first, then adds the reset and flushes again:

```
ESC a 2, block data, LF, ESC a 0
```

The second flush produces a line with a single state item. Since 4.0.0 such a line gets no line feed (`LineComposer.hasContent()` is false for it), so no empty line appears. With `feedAfterBlock: false` the first line gets no line feed either, and the bytes are the same as today, `ESC a 2, block data, ESC a 0`; the fix does not help that configuration on the EC400, and the changelog says so.

### Details

- The pattern is identical in the four methods. A private helper that takes the block items and does the four steps is welcome, so the order is written once; the helper is not required if it makes the methods harder to read.
- The composer's own alignment state, `#composer.align`, is not touched. It stays at `right` or `center` for the text lines that follow, which are padded with spaces as before. Only the printer's alignment is reset, and it is reset in the same place in the item stream relative to the block, one line feed later.
- The `commands` and `lines` output formats show the reset as a line of its own after the block, in the same way a pending style change before a block shows as a line of its own. `test/styled-blocks.js` documents that behaviour for styles and is the reference for what a state-only line looks like in those formats.
- Both languages get the change, since it lives in the encoder layer. StarPRNT sends `ESC GS a 0` for the reset.
- Blocks are not allowed inside table cells and boxes, so embedded encoders are not affected.

### Tests

New test file `test/block-alignment.js`:

- `align('right').image(...).align('left').line('text')` on ESC/POS: the byte array is `ESC a 2`, the raster command, `LF`, `ESC a 0`, the text, `LF`, and nothing else between them. This is the reporter's case 2 from #42.
- The same with `align('center')` and a barcode, a QR code and a PDF417 code, one test each.
- The same image case with `feedAfterBlock: false`: `ESC a 2`, raster, `ESC a 0`, text, `LF`.
- The same image case on StarPRNT.
- A left aligned image followed by text: no alignment command at all, unchanged from 4.0.0.
- Two right aligned images in a row: `ESC a 2`, image, `LF`, `ESC a 0`, `ESC a 2`, image, `LF`, `ESC a 0`. That the reset and the next set are both sent is deliberate: the composer does not know what the printer does with a block, so it does not merge them.
- Exactly one line feed between the block and the text, checked by counting `0x0a` in the array, so a regression that adds an empty line is caught.

Existing tests whose recorded bytes contain an aligned block move the reset after the line feed. Candidates are in `test/feed-after-block.js`, `test/styled-blocks.js`, `test/blank-lines.js`, `test/language-esc-pos.js` and `test/language-star-prnt.js`. The implementation agent updates them and lists every changed expectation; the review checks that each change is exactly the reset moving past one line feed and nothing else.

### Acceptance

- Left aligned blocks encode byte for byte as in 4.0.0.
- For aligned blocks the only difference to 4.0.0 is the position of the reset, verified on the reporter's example with the annotated dump used during the analysis.
- No test asserts an extra empty line after a block.

---

## Section 4: Release 4.0.1

### Changelog and documentation

`documentation/changes.md` gets a new subsection after "New in version 4", titled "Version 4.0.1", with an entry in the navigation list at the top of that file. Three bullets, in the order of the sections:

- Automatic code page selection sends a code page command only when the page changes. Receipts in `auto` mode are shorter; nothing changes on paper.
- Raster images are sent in commands of at most 255 rows, for printers that read only the low byte of the row count. Images of 255 rows or fewer are unchanged.
- The alignment reset after an image, barcode, QR code or PDF417 code is sent after the line feed, for printers that only accept alignment commands at the start of a line. With `feedAfterBlock: false` the order is as before.

The README and the other chapters do not change. `documentation/commands.md` gets one sentence under Image, in the raster part of the tip about image modes, saying that tall images are sent in several commands.

### Known bugs file

The three entries leave `KNOWN-BUGS.md`. If nothing remains, the file is deleted; the analyses live on in this plan and in the changelog.

### Version, build, commit

- `package.json` to 4.0.1.
- `rm -rf dist && npm run build`, `npm test`, and a check that `generated/` did not change.
- One commit, "Release version 4.0.1", with the version bump, the lockfile if it changed, and the rebuilt `dist/`.
- The tag `v4.0.1` on that commit.
- Push and `npm publish` are done by Niels, the publish needs a one-time password.

### After the publish

Replies for the review of Niels, posted only after approval, in the voice described in the memory note on issue replies:

- #42: the fix, the version, a request to try it, and the note that `feedAfterBlock: false` keeps the old order.
- #16: the diagnosis from the row count, the fix, the version, a request to try it. Both issues have the same reporter, so the two replies can refer to each other.
- Neither issue is closed until the reporter confirms, or Niels decides otherwise.

The lockfile of `../ReceiptPrinterPlayground` and the dev dependency of `../ReceiptLine` follow in their own repositories, outside this plan.

---

## Order and what could go wrong

1. Section 1 first: no test output changes, ten minutes of work, and it shakes out the orchestration.
2. Section 2 next: changes bytes only for images taller than 255 rows, which few tests have.
3. Section 3 last: touches the most recorded output. Doing it last means the diff of its test updates contains only its own change.
4. Section 4 once the three are on main.

Risks worth naming:

- Section 2 could be undone by a firmware that also caps the number of raster commands it buffers, or wants a line feed between them. No such printer is known; the renderer check in the acceptance list is there to catch a seam on our own side, not a printer's.
- Section 3 sends the reset on a line that has nothing else. A printer that feeds on a bare `ESC a` would show an empty line; none is known to, and 4.0.0 already sends bare state lines before blocks for pending styles without reports of that.
- Neither #42 nor #16 can be verified without an EC400. If the reporter does not confirm, both fixes still stand on their own: the new byte order follows the specification more closely than the old one, and the chunking costs 8 bytes per 255 rows.
