#!/usr/bin/env node

/*
 * Measures a raster image, the size of a receipt report, through image() and
 * imageAsync(): the total time and the longest stretch of time the thread is
 * frozen. Run it from the repository root:
 *
 *   node tools/profile-image.mjs
 *   node tools/profile-image.mjs --width 576 --heights 1200,3000,6000 --algorithm threshold
 *
 * The numbers come from Node on the machine that runs the script. A device
 * with React Native runs Hermes, which is slower, but the difference between
 * the two calls has the same shape there
 */

import ReceiptPrinterEncoder from '../src/receipt-printer-encoder.js';
import ImageData from '@canvas/image-data';

const args = process.argv.slice(2);

const option = (name, fallback) => args.indexOf(`--${name}`) >= 0 ? args[args.indexOf(`--${name}`) + 1] : fallback;

const width = Number(option('width', 576));
const heights = String(option('heights', '1200,3000,6000')).split(',').map(Number);
const algorithm = option('algorithm', 'threshold');

const options = { language: 'esc-pos', columns: 48, imageMode: 'raster' };

/* A pattern with text-like speckles on a white background */

const make = (w, h) => {
  const image = new ImageData(w, h);

  image.data.fill(255);

  for (let i = 0; i < image.data.length; i += 4 * 97) {
    image.data[i] = 0;
    image.data[i + 1] = 0;
    image.data[i + 2] = 0;
  }

  return image;
};

const run = async (mode, image) => {
  let last = performance.now();
  let frozen = 0;
  let running = true;

  const tick = () => {
    if (!running) {
      return;
    }

    const now = performance.now();

    frozen = Math.max(frozen, now - last - 5);
    last = now;

    setTimeout(tick, 5);
  };

  setTimeout(tick, 5);

  const started = performance.now();
  const encoder = new ReceiptPrinterEncoder(options);

  if (mode === 'async') {
    await encoder.imageAsync(image, { width, algorithm });
  } else {
    encoder.image(image, { width, algorithm });
  }

  const bytes = encoder.encode();
  const ms = performance.now() - started;

  await new Promise((resolve) => setTimeout(resolve, 30));

  running = false;

  return { ms, frozen, bytes };
};

await run('sync', make(width, 300));
await run('async', make(width, 300));

console.log(`${width} dots wide, algorithm ${algorithm}`);
console.log('');

for (const height of heights) {
  const sync = await run('sync', make(width, height));
  const asyncResult = await run('async', make(width, height));
  const same = sync.bytes.length === asyncResult.bytes.length &&
    sync.bytes.every((value, index) => value === asyncResult.bytes[index]);

  console.log(
      `${width}x${height}` +
      `  image(): ${sync.ms.toFixed(1).padStart(6)} ms, frozen ${sync.frozen.toFixed(1).padStart(5)} ms` +
      `  |  imageAsync(): ${asyncResult.ms.toFixed(1).padStart(6)} ms, frozen ${asyncResult.frozen.toFixed(1).padStart(5)} ms` +
      `  |  ${asyncResult.bytes.length} bytes, identical: ${same}`,
  );
}
