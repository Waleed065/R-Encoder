/* Helpers for encoding images without blocking the thread for a long time.
   A timer of zero delay can take up to fifteen milliseconds on Windows, so
   setImmediate is used where it exists, which includes Node and React Native;
   in the browser a timer is the only option. A yield is only inserted when
   enough time has passed since the previous one, so the worst case block
   stays short without paying for a yield after every step on a fast machine */

export const YIELD_INTERVAL_MS = 12;

/* Rows per band for the asynchronous image steps: the copy of the pixel
   buffer, the flatten and the threshold dither are all done this many rows at
   a time, with a yield between bands */

export const BAND_ROWS = 64;

/* The current time, as a number of milliseconds */

export const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

/* Give the thread back to the event loop, so that pending timers, input and
   rendering can run before we continue */

export const yieldToEventLoop = () => typeof setImmediate === 'function' ?
  new Promise((resolve) => setImmediate(resolve)) :
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Threshold dithering of a whole image, in bands
 *
 * Gives the same result as the threshold dither of canvas-dither, which the
 * synchronous pipeline uses: the luminance of every pixel is calculated with
 * the same formula and compared to the same threshold, and the alpha channel
 * is left alone. The image is handled in bands and the thread is given back to
 * the event loop between bands, so that a large image does not block the user
 * interface for as long as the whole conversion takes
 *
 * @param  {object}  image       ImageData object, changed in place
 * @param  {number}  threshold   Threshold value (0-255)
 * @return {Promise<object>}     Promise of the dithered image
 *
 */
export async function thresholdAsync(image, threshold) {
  const data = image.data;
  const stride = image.width * 4;
  let lastYield = now();

  for (let start = 0; start < image.height; start += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, image.height - start);
    const end = (start + rows) * stride;

    for (let i = start * stride; i < end; i += 4) {
      const luminance = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
      const value = luminance < threshold ? 0 : 255;

      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }

    if (start + rows < image.height && now() - lastYield >= YIELD_INTERVAL_MS) {
      await yieldToEventLoop();
      lastYield = now();
    }
  }

  return image;
}

/**
 * Flatten a whole image on a solid background, in bands
 *
 * Gives the same result as the flatten of canvas-flatten, which the
 * synchronous pipeline uses: every pixel is composited with the same formula
 * and the alpha channel is set to opaque. The image is handled in bands, with
 * a yield between them
 *
 * @param  {object}  image        ImageData object, changed in place
 * @param  {number[]}  background   Three values with the r, g and b of the background
 * @return {Promise<object>}      Promise of the flattened image
 *
 */
export async function flattenAsync(image, background) {
  const data = image.data;
  const stride = image.width * 4;
  let lastYield = now();

  for (let start = 0; start < image.height; start += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, image.height - start);
    const end = (start + rows) * stride;

    for (let i = start * stride; i < end; i += 4) {
      const alpha = data[i + 3];
      const invAlpha = 255 - alpha;

      data[i] = (alpha * data[i] + invAlpha * background[0]) / 255;
      data[i + 1] = (alpha * data[i + 1] + invAlpha * background[1]) / 255;
      data[i + 2] = (alpha * data[i + 2] + invAlpha * background[2]) / 255;
      data[i + 3] = 0xff;
    }

    if (start + rows < image.height && now() - lastYield >= YIELD_INTERVAL_MS) {
      await yieldToEventLoop();
      lastYield = now();
    }
  }

  return image;
}

/**
 * Copy a pixel buffer into an ImageData, in bands
 *
 * The same result as a single set() with the whole buffer, but a large buffer
 * is copied a band of rows at a time with a yield between bands, so that the
 * copy of a tall image does not block the thread. Typed buffers are copied
 * through a subarray view, plain arrays through a slice
 *
 * @param  {object}  image   ImageData object, changed in place
 * @param  {ArrayLike<number>}  from   The pixel data to copy
 * @return {Promise<object>}   Promise of the image
 *
 */
export async function copyAsync(image, from) {
  const data = image.data;
  const stride = image.width * 4;
  let lastYield = now();

  for (let start = 0; start < image.height; start += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, image.height - start);
    const begin = start * stride;
    const end = (start + rows) * stride;
    const band = typeof from.subarray === 'function' ? from.subarray(begin, end) : from.slice(begin, end);

    data.set(band, begin);

    if (start + rows < image.height && now() - lastYield >= YIELD_INTERVAL_MS) {
      await yieldToEventLoop();
      lastYield = now();
    }
  }

  return image;
}
