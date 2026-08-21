/**
 * Regression tests for the R-Encoder fork.
 *
 * Run with: npm test  (node --test test/)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import ReceiptPrinterEncoder from "../dist/receipt-printer-encoder.mjs";

const GS_V0_HEADER = [0x1d, 0x76, 0x30];

function countSequence(bytes, seq) {
  let count = 0;
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) {
        continue outer;
      }
    }
    count++;
  }
  return count;
}

function indexOfSequence(bytes, seq) {
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function makeImage(width, height, fillRgba) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(fillRgba, i * 4);
  }
  return { data, width, height };
}

function createEncoder(options) {
  return new ReceiptPrinterEncoder({
    imageMode: "raster",
    columns: 48,
    language: "esc-pos",
    ...options,
  });
}

test("no paper feed after the cut command", async () => {
  const enc = createEncoder({ feedBeforeCut: 1 });
  enc.size(2, 2).bold(true).text("* UNPAID *");
  enc.newline(1);
  enc.qrcode("https://x.com", 2, 4, "h");
  enc.bold(false);
  enc.text("Powered by");
  enc.newline(1);
  enc.cut("partial");

  const out = enc.encode();
  const cutIndex = indexOfSequence(out, [0x1d, 0x56]);

  assert.ok(cutIndex >= 0, "cut command (GS V) present");
  assert.ok(
    !out.slice(cutIndex + 2).includes(0x0a),
    "no line feed after the cut command",
  );
});

test("no blank line feed after a raster image", async () => {
  const enc = createEncoder();
  await enc.image(makeImage(8, 8, [255, 255, 255, 255]), 8, 8);
  enc.cut("partial");

  const out = enc.encode();
  const imgIndex = indexOfSequence(out, GS_V0_HEADER);
  assert.ok(imgIndex >= 0, "raster image command present");

  // 8 byte header + 8 bytes of raster data (1 byte per row).
  const afterImage = out[imgIndex + 8 + 8];
  assert.notEqual(afterImage, 0x0a, "no line feed directly after image data");
});

test("transparent pixels do not print", async () => {
  const enc = createEncoder();
  // Fully transparent pixels with dark RGB values: must stay white.
  await enc.image(makeImage(8, 8, [0, 0, 0, 0]), 8, 8);
  enc.cut("partial");

  const out = enc.encode();
  const imgIndex = indexOfSequence(out, GS_V0_HEADER);
  const raster = out.slice(imgIndex + 8, imgIndex + 8 + 8);

  assert.deepEqual([...raster], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test("opaque black pixels print as dots", async () => {
  const enc = createEncoder();
  await enc.image(makeImage(8, 8, [0, 0, 0, 255]), 8, 8);
  enc.cut("partial");

  const out = enc.encode();
  const imgIndex = indexOfSequence(out, GS_V0_HEADER);
  const raster = out.slice(imgIndex + 8, imgIndex + 8 + 8);

  assert.deepEqual([...raster], [255, 255, 255, 255, 255, 255, 255, 255]);
});

test("RLE compression is used when the printer supports it", async () => {
  const enc = new ReceiptPrinterEncoder({
    printerModel: "epson-tm-t88vi",
    imageMode: "raster",
  });
  await enc.image(makeImage(16, 16, [255, 255, 255, 255]), 16, 16);
  enc.cut("partial");

  const out = enc.encode();
  const imgIndex = indexOfSequence(out, GS_V0_HEADER);

  assert.equal(out[imgIndex + 3], 0x01, "GS v 0 mode byte is RLE (1)");
});

test("large images are split into 512px strips", async () => {
  const enc = createEncoder();
  await enc.image(makeImage(576, 600, [255, 255, 255, 255]), 576, 600);
  enc.cut("partial");

  const out = enc.encode();
  assert.equal(
    countSequence(out, GS_V0_HEADER),
    2,
    "two raster strips (512 + 88)",
  );
});

test("unknown 'NxM' font size does not throw", () => {
  const enc = createEncoder();
  assert.doesNotThrow(() => {
    enc.font("99x99");
  });
});

test("newline '\\r\\n' produces CR LF", () => {
  const enc = createEncoder({ newline: "\r\n" });
  enc.line("a").line("b").cut("partial");

  const out = enc.encode();
  assert.ok(indexOfSequence(out, [0x0d, 0x0a]) >= 0, "CR LF present");
});

test("no style-only blank feeds around the QR and the cut", () => {
  // While a non-default style is active (bold + size 2), the flushes around
  // the QR code and the cut must not emit style-only lines, each of which
  // would print as an extra blank feed.
  const enc = createEncoder({ feedBeforeCut: 1 });
  enc.size(2, 2).bold(true).text("* UNPAID *");
  enc.newline(1);
  enc.qrcode("https://x.com", 2, 4, "h");
  enc.bold(false);
  enc.text("Powered by");
  enc.newline(1);
  enc.cut("partial");

  const out = enc.encode();

  const countLF = (a, b) => {
    let n = 0;
    for (let i = a; i < b; i++) {
      if (out[i] === 0x0a) n++;
    }
    return n;
  };

  const latin = Buffer.from(out).toString("latin1");
  const statusEnd = latin.indexOf("* UNPAID *") + 10;
  const poweredAt = latin.indexOf("Powered by");
  const qrPrintAt = indexOfSequence(
    out,
    [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30],
  );
  const cutAt = indexOfSequence(out, [0x1d, 0x56]);

  assert.ok(statusEnd > 0, "status text present");
  assert.ok(poweredAt > 0, "powered-by text present");
  assert.ok(qrPrintAt >= 0, "QR print command present");
  assert.ok(cutAt >= 0, "cut command present");

  // Exactly one feed between the status line and the QR, one between the QR
  // and "Powered by", and one feed (feedBeforeCut) before the cut. No
  // style-only feeds anywhere in between.
  assert.equal(countLF(statusEnd, qrPrintAt), 1, "one feed between status and QR");
  assert.equal(countLF(qrPrintAt + 8, poweredAt), 1, "one feed between QR and powered-by");
  assert.equal(countLF(poweredAt + 10, cutAt), 2, "one feed after powered-by + one feedBeforeCut");
  assert.ok(!out.slice(cutAt + 3).includes(0x0a), "no line feed after the cut");
});

test("memory pool never returns an undersized buffer", async () => {
  // Regression: two images whose strip byte-counts round to the same
  // power-of-2 bucket but differ in exact size. The second image used to
  // pop a shorter pooled view and silently truncate its raster payload.
  const enc = createEncoder();
  await enc.image(makeImage(208, 200, [0, 0, 0, 255]), 208, 200);
  await enc.image(makeImage(208, 300, [0, 0, 0, 255]), 208, 300);

  const imageCommands = enc
    .commands()
    .flatMap((line) => line.commands)
    .filter((command) => command.type === "image");

  assert.ok(imageCommands.length > 0, "image commands present");

  for (const command of imageCommands) {
    const payload = command.payload;
    // GS v 0 header: 1D 76 30 m xL xH yL yH [data]
    const widthBytes = payload[4] | (payload[5] << 8);
    const height = payload[6] | (payload[7] << 8);
    const declared = widthBytes * height;
    const actual = payload.length - 8;
    assert.equal(
      actual,
      declared,
      `GS v 0 payload must match header: got ${actual} bytes, header declares ${declared}`,
    );
  }
});

test("double underline emits ESC - 2", () => {
  const enc = createEncoder();
  enc.underline(2).line("total").cut("partial");

  const out = enc.encode();
  assert.ok(indexOfSequence(out, [0x1b, 0x2d, 0x02]) >= 0, "ESC - 2 present");
});

test("basic text receipt still encodes correctly", () => {
  const enc = createEncoder();
  enc.line("Hello").cut("partial");

  const out = enc.encode();
  const text = Buffer.from(out).toString("latin1");
  assert.ok(text.includes("Hello"), "text present");
});
