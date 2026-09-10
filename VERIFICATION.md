# R-Encoder Fork Verification

**Scope:** verify ONLY the fork at `C:\Users\PC\Desktop\eposmatic\R-Encoder`
(a fork of `@point-of-sale/receipt-printer-encoder`). The POS app is NOT part
of this verification — it consumes this repo via the git dependency
`github:Waleed065/R-Encoder#main` and has not been installed against it yet.

**Method:** read the current files (do not trust this document — re-verify
against the working tree), run the commands below, and report PASS/FAIL with
`file:line` evidence.

---

## 1. Baseline commands (must all pass)

| # | Command | Expected |
|---|---------|----------|
| B1 | `npm run build` | exit 0; regenerates `generated/` + `dist/` |
| B2 | `npm test` (node --test) | 11/11 pass |
| B3 | `git diff --numstat -- generated/` | zero content changes after a rebuild (line-ending noise only) |
| B4 | rebuild twice → MD5 of the 4 bundles identical | deterministic build |
| B5 | `git status --porcelain` | no unexpected files (only the intended modified files + `?? test/`) |

---

## 2. Source claims (1–19)

### src/receipt-printer-encoder.js
| # | Claim | Verify |
|---|-------|--------|
| 1 | `encode()` appends no trailing LF/CR after a line whose last **meaningful** command is `cut`/`pulse`/`image` (align/style/font/codepage/line-spacing ignored when finding the last meaningful command) | read `needsNewline`/`terminalTypes`; byte check in §3 |
| 2 | `encode()` supports `newline: '\r\n'` (writes `0d 0a`; was silently dropped) | read newline write branch; runtime check §3 |
| 3 | `commands()` drops a trailing style-only line from the final composer flush (no blank feed after cut) | read `hasContent` filter + `src/line-composer.js` `onlyFormatting` |
| 4 | `font('NxM')` with unknown size → relaxed warning (console.warn), no TypeError | read `font()` → `#error(...,'relaxed')` |
| 5 | Auto-codepage emits `ESC t` only when the codepage actually changes | read `#encodeText` auto branch; runtime: expect 1× `1b 74` for repeated same-codepage text |

### src/image-encoder.js
| # | Claim | Verify |
|---|-------|--------|
| 6 | `getPixel()`: alpha < 128 → white (0); opaque pixels → luminance threshold (Rec.709) | read `getPixel`; transparent-logo test |
| 7 | `pixelsToRasterStrip()` exists (one strip); `pixelsToRasterStrips()` delegates to it; `IMAGE_STRIP_HEIGHT = 512` | read + strip-split test (576×600 → 2 GS v 0 strips) |
| 8 | `releaseBuffer()` exists; every pooled strip buffer is released only AFTER its bytes are copied into a command payload (no leak / no use-after-release) | read all `releaseBuffer` call sites in esc-pos/star-prnt; confirm copy-then-release order |

### src/languages/esc-pos.js
| # | Claim | Verify |
|---|-------|--------|
| 9 | `underline(2)` emits `1b 2d 02` | read + test |
| 10 | `size()` bit packing parenthesized: `((height-1)&0x0f) | (((width-1)&0x0f)<<4)` | read |
| 11 | `_processImageAsync()` raster path converts ONE strip at a time and `await setTimeout(0)` between strips (pixel conversion yields) | read |
| 12 | Sync image paths release pooled strip buffers after building commands (raster + column) | read |

### src/languages/star-prnt.js
| # | Claim | Verify |
|---|-------|--------|
| 13 | `image()` normalizes a non-object `options` arg (main encoder passes its `imageMode` string) | read |
| 14 | `underline(2)` emits `1b 2d 02` | read |
| 15 | Sync image path releases pooled strip buffers | read |

### tools/generate.js
| # | Claim | Verify |
|---|-------|--------|
| 16 | Generator rethrows errors (no swallow), strips `\r` before splitting lines, validates mapping lines; `npm run build` succeeds and `generated/mapping.js` + `generated/printers.js` are content-identical to the committed versions (`git diff --numstat` = zero) | read + B3 |

### receipt-printer-encoder.d.ts + runtime exports
| # | Claim | Verify |
|---|-------|--------|
| 17 | `export class ImageEncoder` removed from d.ts; runtime bundle exports ONLY the default class | `node --input-type=module -e "import R,*as ns from './dist/receipt-printer-encoder.mjs'; console.log(Object.keys(ns))"` → `["default"]` |

### package.json / README.md / test/
| # | Claim | Verify |
|---|-------|--------|
| 18 | `npm test` (node --test) exists; all tests in `test/encoder.test.mjs` pass | B2 |
| 19 | README: strip-height refs say 512 (not 256); version header matches package.json (3.0.4); "yield" docs say "after every strip" (not every 4 strips) | grep README |

---

## 3. Byte-level receipt ending

```js
import R from './dist/receipt-printer-encoder.mjs';
const e = new R({ imageMode:'raster', columns:48, language:'esc-pos', feedBeforeCut:1 });
e.size(2,2).bold(true).text('* UNPAID *').newline(1);
e.qrcode('https://x.com',2,4,'h').bold(false).text('Powered by').newline(1).cut('partial');
const out = e.encode();
```

Assert (use the test helpers `indexOfSequence`/`countLF` in `test/encoder.test.mjs`):
- last `0x0a` never appears after the `1d 56` (GS V) cut — i.e. `out.slice(cut+3).includes(0x0a) === false`
- exactly 1 feed between status and QR, 1 between QR and "Powered by", 2 before the cut (1 + feedBeforeCut)
- total LF = 4, total CR = 4 (default `newline: '\n\r'`)

Also spot-check edge cases for the encode() size pre-calculation vs write loop
(no buffer over/under-run):
- empty receipt → 0 bytes
- pulse-only → no trailing LF
- image-only → no trailing LF
- text with no cut → exactly one LF
- `newline: '\r\n'` → CR LF pairs
- `feedBeforeCut: 4` → 5 LFs

---

## 4. Repo hygiene

| # | Check | Notes |
|---|-------|-------|
| H1 | `git status --porcelain` — list every modified/untracked file | flag anything unexpected (e.g. unlisted files, formatting churn) |
| H2 | Stale-reference scan: `256px|256-pixel|every 4 strips|Version: 1.0.2|export class ImageEncoder` across src/test/tools/data/README | expect zero |
| H3 | Dead code (report, do not remove): `pixelsToRaster`, `buildRasterCommandsFromStrips`, `decompressRLE`, `generateChunksAsync` in `src/image-encoder.js` | confirm each has no call site; note `releasePool` + `processImageAsync` raster branch as bonus |
| H4 | Pre-existing quirks (confirm pre-existing, not new): `npm run lint` (`eslint --fix`, google config = LF linebreaks) would mass-rewrite CRLF files; `dist/` is committed so stale dist = stale behavior for consumers | check `.eslintrc.json` + an untouched file (`src/text-wrap.js`) |

---

## 5. Report format

Return:
1. VERDICT: PASS / PASS WITH ISSUES / FAIL.
2. Table: claim # → verified / failed / N/A, with evidence (command output, `file:line`).
3. Any NEW issues (severity high/medium/low, `file:line`, suggested fix).
4. Behavior that differs from the claims above.
5. Final yes/no: is the fork safe to commit + push (to be consumed by the POS app via `github:Waleed065/R-Encoder#main`)?

Do not modify source files. Report findings only.
