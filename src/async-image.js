/* Helpers for encoding images without blocking the thread for a long time.
   A timer of zero delay can take up to fifteen milliseconds on Windows, so
   setImmediate is used where it exists, which includes Node and React Native;
   in the browser a timer is the only option. A yield is only inserted when
   enough time has passed since the previous one, so the worst case block
   stays short without paying for a yield after every step on a fast machine */

export const YIELD_INTERVAL_MS = 12;

/* Rows per band when dithering asynchronously */

export const THRESHOLD_BAND_ROWS = 64;

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

  for (let start = 0; start < image.height; start += THRESHOLD_BAND_ROWS) {
    const rows = Math.min(THRESHOLD_BAND_ROWS, image.height - start);
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
