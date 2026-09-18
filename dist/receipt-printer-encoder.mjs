import Dither from 'canvas-dither';
import Flatten from 'canvas-flatten';
import CodepageEncoder from '@point-of-sale/codepage-encoder';
import ImageData from '@canvas/image-data';
import resizeImageData from 'resize-image-data';

/* The maximum number of rows in a single GS v 0 command. The row count is sent
   as a low and a high byte, but there is firmware that reads only the low byte,
   and prints the rest of the pixel data as text and commands. Taller images are
   split into chunks of this many rows, see #16 */

const RASTER_CHUNK_HEIGHT = 255;

/**
 * ESC/POS Language commands
 */
class LanguageEscPos {
  /**
     * Initialize the printer
     * @return {Array}         Array of bytes to send to the printer
     */
  initialize() {
    return [
      {
        type: 'initialize',
        payload: [0x1b, 0x40],
      },
      {
        type: 'character-mode',
        value: 'single byte',
        payload: [0x1c, 0x2e],
      },
      {
        type: 'font',
        value: 'A',
        payload: [0x1b, 0x4d, 0x00],
      },
    ];
  }

  /**
     * Change the font
     * @param {string} value    Font type ('A', 'B', or more)
     * @return {Array}         Array of bytes to send to the printer
     */
  font(value) {
    const type = value.charCodeAt(0) - 0x41;

    return [
      {
        type: 'font',
        value,
        payload: [0x1b, 0x4d, type],
      },
    ];
  }

  /**
     * Change the line spacing
     * @param {string|number} value    Line spacing ('default', 'none', or a number of motion units)
     * @return {Array}         Array of bytes to send to the printer
     */
  lineSpacing(value) {
    if (value === 'default') {
      return [
        {
          type: 'line-spacing',
          value: 'default',
          payload: [0x1b, 0x32],
        },
      ];
    }

    if (value === 'none') {
      return [
        {
          type: 'line-spacing',
          value: 'none',
          payload: [0x1b, 0x33, 0x00],
        },
      ];
    }

    if (typeof value === 'number') {
      return [
        {
          type: 'line-spacing',
          value: `${value} dots`,
          payload: [0x1b, 0x33, value],
        },
      ];
    }

    throw new Error('Unknown line spacing');
  }

  /**
     * Change the alignment
     * @param {string} value    Alignment value ('left', 'center', 'right')
     * @return {Array}         Array of bytes to send to the printer
     */
  align(value) {
    let align = 0x00;

    if (value === 'center') {
      align = 0x01;
    } else if (value === 'right') {
      align = 0x02;
    }

    return [
      {
        type: 'align',
        value,
        payload: [0x1b, 0x61, align],
      },
    ];
  }

  /**
     * Generate a barcode
     * @param {string} value        Value to encode
     * @param {string|number} symbology    Barcode symbology
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  barcode(value, symbology, options) {
    const result = [];

    const symbologies = {
      'upca': 0x00,
      'upce': 0x01,
      'ean13': 0x02,
      'ean8': 0x03,
      'code39': 0x04,
      'coda39': 0x04, /* typo, leave here for backwards compatibility */
      'itf': 0x05,
      'interleaved-2-of-5': 0x05,
      'nw-7': 0x06,
      'codabar': 0x06,
      'code93': 0x48,
      'code128': 0x49,
      'gs1-128': 0x4a,
      'gs1-databar-omni': 0x4b,
      'gs1-databar-truncated': 0x4c,
      'gs1-databar-limited': 0x4d,
      'gs1-databar-expanded': 0x4e,
      'code128-auto': 0x4f,
    };

    if (typeof symbology === 'string' && typeof symbologies[symbology] === 'undefined') {
      throw new Error(`Symbology '${symbology}' not supported by language`);
    }

    /* Calculate segment width */

    if (options.width < 1 || options.width > 3) {
      throw new Error('Width must be between 1 and 3');
    }

    let width = options.width + 1;

    if (symbology === 'itf') {
      width = options.width * 2;
    }

    if (symbology === 'gs1-128' || symbology === 'gs1-databar-omni' ||
        symbology === 'gs1-databar-truncated' || symbology === 'gs1-databar-limited' ||
        symbology === 'gs1-databar-expanded') {
      width = options.width;
    }

    /* Set barcode options */

    result.push(
        {
          type: 'barcode',
          property: 'height',
          value: options.height,
          payload: [0x1d, 0x68, options.height],
        },
        {
          type: 'barcode',
          property: 'width',
          value: options.width,
          payload: [0x1d, 0x77, width],
        },
        {
          type: 'barcode',
          property: 'text',
          value: options.text,
          payload: [0x1d, 0x48, {none: 0x00, above: 0x01, below: 0x02, both: 0x03}[options.text]],
        },
    );


    /* Encode barcode */

    if (symbology == 'code128' && !value.startsWith('{')) {
      value = '{B' + value;
    }

    if (symbology == 'gs1-128') {
      value = value.replace(/[()*]/g, '');
    }

    const bytes = CodepageEncoder.encode(value, 'ascii');

    const identifier = typeof symbology === 'string' ? symbologies[symbology] : symbology;

    if (identifier > 0x40) {
      /* Function B symbologies */

      result.push(
          {
            type: 'barcode',
            value: {symbology: symbology, data: value},
            payload: [0x1d, 0x6b, identifier, bytes.length, ...bytes],
          },
      );
    } else {
      /* Function A symbologies */

      result.push(
          {
            type: 'barcode',
            value: {symbology: symbology, data: value},
            payload: [0x1d, 0x6b, identifier, ...bytes, 0x00],
          },
      );
    }

    return result;
  }

  /**
     * Generate a QR code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  qrcode(value, options) {
    const result = [];

    /* Model */

    if (typeof options.model === 'number') {
      const models = {
        1: 0x31,
        2: 0x32,
      };

      if (options.model in models) {
        result.push(
            {
              type: 'qrcode',
              property: 'model',
              value: options.model,
              payload: [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, models[options.model], 0x00],
            },
        );
      } else {
        throw new Error('Model must be 1 or 2');
      }
    }

    /* Size */

    if (typeof options.size !== 'number') {
      throw new Error('Size must be a number');
    }

    if (options.size < 1 || options.size > 8) {
      throw new Error('Size must be between 1 and 8');
    }

    result.push(
        {
          type: 'qrcode',
          property: 'size',
          value: options.size,
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, options.size],
        },
    );

    /* Error level */

    const errorlevels = {
      'l': 0x30,
      'm': 0x31,
      'q': 0x32,
      'h': 0x33,
    };

    if (options.errorlevel in errorlevels) {
      result.push(
          {
            type: 'qrcode',
            property: 'errorlevel',
            value: options.errorlevel,
            payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, errorlevels[options.errorlevel]],
          },
      );
    } else {
      throw new Error('Error level must be l, m, q or h');
    }

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'iso8859-1');
    const length = bytes.length + 3;

    result.push(
        {
          type: 'qrcode',
          property: 'data',
          value,
          payload: [0x1d, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes],
        },
    );

    /* Print QR code */

    result.push(
        {
          type: 'qrcode',
          command: 'print',
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30],
        },
    );

    return result;
  }

  /**
     * Generate a PDF417 code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  pdf417(value, options) {
    const result = [];

    /* Columns */

    if (typeof options.columns !== 'number') {
      throw new Error('Columns must be a number');
    }

    if (options.columns !== 0 && (options.columns < 1 || options.columns > 30)) {
      throw new Error('Columns must be 0, or between 1 and 30');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'columns',
          value: options.columns,
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x41, options.columns],
        },
    );

    /* Rows */

    if (typeof options.rows !== 'number') {
      throw new Error('Rows must be a number');
    }

    if (options.rows !== 0 && (options.rows < 3 || options.rows > 90)) {
      throw new Error('Rows must be 0, or between 3 and 90');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'rows',
          value: options.rows,
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x42, options.rows],
        },
    );

    /* Width */

    if (typeof options.width !== 'number') {
      throw new Error('Width must be a number');
    }

    if (options.width < 2 || options.width > 8) {
      throw new Error('Width must be between 2 and 8');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'width',
          value: options.width,
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x43, options.width],
        },
    );

    /* Height */

    if (typeof options.height !== 'number') {
      throw new Error('Height must be a number');
    }

    if (options.height < 2 || options.height > 8) {
      throw new Error('Height must be between 2 and 8');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'height',
          value: options.height,
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x44, options.height],
        },
    );

    /* Error level */

    if (typeof options.errorlevel !== 'number') {
      throw new Error('Errorlevel must be a number');
    }

    if (options.errorlevel < 0 || options.errorlevel > 8) {
      throw new Error('Errorlevel must be between 0 and 8');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'errorlevel',
          value: options.errorlevel,
          payload: [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x30, 0x45, 0x30, options.errorlevel + 0x30],
        },
    );

    /* Model: standard or truncated */

    result.push(
        {
          type: 'pdf417',
          property: 'truncated',
          value: !!options.truncated,
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x46, options.truncated ? 0x01 : 0x00],
        },
    );

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'ascii');
    const length = bytes.length + 3;

    result.push(
        {
          type: 'pdf417',
          property: 'data',
          value,
          payload: [0x1d, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x30, 0x50, 0x30, ...bytes],
        },
    );

    /* Print PDF417 code */

    result.push(
        {
          type: 'pdf417',
          command: 'print',
          payload: [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x30, 0x51, 0x30],
        },
    );

    return result;
  }

  /**
     * Encode an image
     * @param {ImageData} image     ImageData object
     * @param {number} width        Width of the image
     * @param {number} height       Height of the image
     * @param {string} mode         Image encoding mode ('column' or 'raster')
     * @param {number} [dpi]        Resolution of the printer in dots per inch, if known
     * @return {Array}             Array of bytes to send to the printer
     */
  image(image, width, height, mode, dpi) {
    const result = [];

    const getPixel = (x, y) => x < width && y < height ? (image.data[((width * y) + x) * 4] > 0 ? 0 : 1) : 0;

    const getColumnData = (width, height) => {
      const data = [];

      for (let s = 0; s < Math.ceil(height / 24); s++) {
        const bytes = new Uint8Array(width * 3);

        for (let x = 0; x < width; x++) {
          for (let c = 0; c < 3; c++) {
            for (let b = 0; b < 8; b++) {
              bytes[(x * 3) + c] |= getPixel(x, (s * 24) + b + (8 * c)) << (7 - b);
            }
          }
        }

        data.push(bytes);
      }

      return data;
    };

    const getRowData = (width, start, rows) => {
      const bytes = new Uint8Array((width * rows) >> 3);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < width; x = x + 8) {
          for (let b = 0; b < 8; b++) {
            bytes[(y * (width >> 3)) + (x >> 3)] |= getPixel(x + b, start + y) << (7 - b);
          }
        }
      }

      return bytes;
    };

    /* Encode images with ESC * */

    if (mode == 'column') {
      /* The line spacing is set in motion units, which are not the same as dots
         on every printer. On Epson printers the vertical motion unit is half a
         dot by default. When the resolution is known, set the motion unit to
         one dot, so 24 units are 24 dots and the strips of the image join up */

      if (dpi) {
        result.push(
            {
              type: 'motion-unit',
              value: dpi,
              payload: [0x1d, 0x50, dpi, dpi],
            },
        );
      }

      result.push(...this.lineSpacing(24));

      getColumnData(width, height).forEach((bytes) => {
        result.push(
            {
              type: 'image',
              property: 'data',
              value: 'column',
              width,
              height: 24,
              payload: [0x1b, 0x2a, 0x21, width & 0xff, (width >> 8) & 0xff, ...bytes, 0x0a],
            },
        );
      });

      result.push(...this.lineSpacing('default'));

      /* Restore the default motion units */

      if (dpi) {
        result.push(
            {
              type: 'motion-unit',
              value: 'default',
              payload: [0x1d, 0x50, 0x00, 0x00],
            },
        );
      }
    }

    /* Encode images with GS v */

    if (mode == 'raster') {
      /* One command per chunk of at most 255 rows. A raster command prints its
         rows and stops, so the chunks join without a seam */

      for (let start = 0; start < height; start += RASTER_CHUNK_HEIGHT) {
        const rows = Math.min(RASTER_CHUNK_HEIGHT, height - start);

        result.push(
            {
              type: 'image',
              command: 'data',
              value: 'raster',
              width,
              height: rows,
              payload: [
                0x1d, 0x76, 0x30, 0x00,
                (width >> 3) & 0xff, (((width >> 3) >> 8) & 0xff),
                rows & 0xff, ((rows >> 8) & 0xff),
                ...getRowData(width, start, rows),
              ],
            },
        );
      }
    }

    return result;
  }

  /**
     * Cut the paper
     * @param {string} value    Cut type ('full' or 'partial')
     * @return {Array}         Array of bytes to send to the printer
     */
  cut(value) {
    let data = 0x00;

    if (value == 'partial') {
      data = 0x01;
    }

    return [
      {
        type: 'cut',
        payload: [0x1d, 0x56, data],
      },
    ];
  }

  /**
     * Send a pulse to the cash drawer
     * @param {number} device   Device number
     * @param {number} on       Pulse ON time
     * @param {number} off      Pulse OFF time
     * @return {Array}         Array of bytes to send to the printer
     */
  pulse(device, on, off) {
    if (typeof device === 'undefined') {
      device = 0;
    }

    if (typeof on === 'undefined') {
      on = 100;
    }

    if (typeof off === 'undefined') {
      off = 500;
    }

    on = Math.max(0, Math.min(255, Math.round(on / 2)));
    off = Math.max(0, Math.min(255, Math.round(off / 2)));


    return [
      {
        type: 'pulse',
        payload: [0x1b, 0x70, device ? 1 : 0, on & 0xff, off & 0xff],
      },
    ];
  }

  /**
     * Enable or disable bold text
     * @param {boolean} value   Enable or disable bold text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  bold(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x45, data,
    ];
  }

  /**
     * Enable or disable underline text
     * @param {boolean} value   Enable or disable underline text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  underline(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x2d, data,
    ];
  }

  /**
     * Enable or disable italic text
     * @param {boolean} value   Enable or disable italic text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  italic(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x34, data,
    ];
  }

  /**
     * Enable or disable inverted text
     * @param {boolean} value   Enable or disable inverted text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  invert(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1d, 0x42, data,
    ];
  }

  /**
     * Change text size
     * @param {number} width    Width of the text (1-8)
     * @param {number} height   Height of the text (1-8)
     * @return {Array}         Array of bytes to send to the printer
     */
  size(width, height) {
    return [
      0x1d, 0x21, (height - 1) | (width - 1) << 4,
    ];
  }

  /**
     * Change the codepage
     * @param {number} value    Codepage value
     * @return {Array}         Array of bytes to send to the printer
     */
  codepage(value) {
    return [
      0x1b, 0x74, value,
    ];
  }

  /**
     * Flush the printers line buffer
     * @return {Array}         Array of bytes to send to the printer
     */
  flush() {
    return [];
  }
}

/**
 * StarPRNT Language commands
 */
class LanguageStarPrnt {
  /**
     * Initialize the printer
     * @return {Array}         Array of bytes to send to the printer
     */
  initialize() {
    return [
      {
        type: 'initialize',
        payload: [0x1b, 0x40, 0x18],
      },
    ];
  }

  /**
     * Change the font
     * @param {string} value     Font type ('A', 'B' or 'C')
     * @return {Array}         Array of bytes to send to the printer
     */
  font(value) {
    let type = 0x00;

    if (value === 'B') {
      type = 0x01;
    }

    if (value === 'C') {
      type = 0x02;
    }

    return [
      {
        type: 'font',
        value,
        payload: [0x1b, 0x1e, 0x46, type],
      },
    ];
  }

  /**
     * Change the line spacing
     * @param {string} value    Line spacing ('default' or 'none')
     * @return {Array}         Array of bytes to send to the printer
     */
  lineSpacing(value) {
    if (value === 'default') {
      return [
        {
          type: 'line-spacing',
          value: 'default',
          payload: [0x1b, 0x7a, 0x01],
        },
      ];
    }

    if (value === 'none') {
      return [
        {
          type: 'line-spacing',
          value: 'none',
          payload: [0x1b, 0x30],
        },
      ];
    }

    throw new Error('Unknown line spacing');
  }

  /**
     * Change the alignment
     * @param {string} value    Alignment value ('left', 'center', 'right')
     * @return {Array}         Array of bytes to send to the printer
     */
  align(value) {
    let align = 0x00;

    if (value === 'center') {
      align = 0x01;
    } else if (value === 'right') {
      align = 0x02;
    }

    return [
      {
        type: 'align',
        value,
        payload: [0x1b, 0x1d, 0x61, align],
      },
    ];
  }

  /**
     * Generate a barcode
     * @param {string} value        Value to encode
     * @param {string|number} symbology    Barcode symbology
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  barcode(value, symbology, options) {
    const result = [];

    const symbologies = {
      'upce': 0x00,
      'upca': 0x01,
      'ean8': 0x02,
      'ean13': 0x03,
      'code39': 0x04,
      'itf': 0x05,
      'interleaved-2-of-5': 0x05,
      'code128': 0x06,
      'code93': 0x07,
      'nw-7': 0x08,
      'codabar': 0x08,
      'gs1-128': 0x09,
      'gs1-databar-omni': 0x0a,
      'gs1-databar-truncated': 0x0b,
      'gs1-databar-limited': 0x0c,
      'gs1-databar-expanded': 0x0d,
    };

    if (typeof symbology === 'string' && typeof symbologies[symbology] === 'undefined') {
      throw new Error(`Symbology '${symbology}' not supported by language`);
    }

    if (options.width < 1 || options.width > 3) {
      throw new Error('Width must be between 1 and 3');
    }

    /* Selecting mode A, B or C for Code128 is not supported for StarPRNT, so ignore it and let the printer choose */

    if (symbology === 'code128' && value.startsWith('{')) {
      value = value.slice(2);
    }

    /* Encode the barcode value */

    const bytes = CodepageEncoder.encode(value, 'ascii');

    const identifier = typeof symbology === 'string' ? symbologies[symbology] : symbology;

    result.push(
        {
          type: 'barcode',
          value: {symbology: symbology, data: value, width: options.width, height: options.height, text: options.text},
          /* Star prints the human readable text below the bars or not at all,
             so text above the bars, or on both sides, is printed below */

          payload: [
            0x1b, 0x62,
            identifier,
            options.text === 'none' ? 0x01 : 0x02,
            options.width,
            options.height,
            ...bytes, 0x1e,
          ],
        },
    );

    return result;
  }

  /**
     * Generate a QR code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  qrcode(value, options) {
    const result = [];

    /* Model */

    const models = {
      1: 0x01,
      2: 0x02,
    };

    if (options.model in models) {
      result.push(
          {
            type: 'qrcode',
            property: 'model',
            value: options.model,
            payload: [0x1b, 0x1d, 0x79, 0x53, 0x30, models[options.model]],
          },
      );
    } else {
      throw new Error('Model must be 1 or 2');
    }

    /* Size */

    if (typeof options.size !== 'number') {
      throw new Error('Size must be a number');
    }

    if (options.size < 1 || options.size > 8) {
      throw new Error('Size must be between 1 and 8');
    }

    result.push(
        {
          type: 'qrcode',
          property: 'size',
          value: options.size,
          payload: [0x1b, 0x1d, 0x79, 0x53, 0x32, options.size],
        },
    );

    /* Error level */

    const errorlevels = {
      'l': 0x00,
      'm': 0x01,
      'q': 0x02,
      'h': 0x03,
    };

    if (options.errorlevel in errorlevels) {
      result.push(
          {
            type: 'qrcode',
            property: 'errorlevel',
            value: options.errorlevel,
            payload: [0x1b, 0x1d, 0x79, 0x53, 0x31, errorlevels[options.errorlevel]],
          },
      );
    } else {
      throw new Error('Error level must be l, m, q or h');
    }

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'iso8859-1');
    const length = bytes.length;

    result.push(
        {
          type: 'qrcode',
          property: 'data',
          value,
          payload: [
            0x1b, 0x1d, 0x79, 0x44, 0x31, 0x00,
            length & 0xff, (length >> 8) & 0xff,
            ...bytes,
          ],
        },
    );

    /* Print QR code */

    result.push(
        {
          type: 'qrcode',
          command: 'print',
          payload: [0x1b, 0x1d, 0x79, 0x50],
        },
    );

    return result;
  }

  /**
     * Generate a PDF417 code
     * @param {string} value        Value to encode
     * @param {object} options      Configuration object
     * @return {Array}             Array of bytes to send to the printer
     */
  pdf417(value, options) {
    const result = [];

    /* Columns and Rows */

    if (typeof options.columns !== 'number') {
      throw new Error('Columns must be a number');
    }

    if (options.columns !== 0 && (options.columns < 1 || options.columns > 30)) {
      throw new Error('Columns must be 0, or between 1 and 30');
    }

    if (typeof options.rows !== 'number') {
      throw new Error('Rows must be a number');
    }

    if (options.rows !== 0 && (options.rows < 3 || options.rows > 90)) {
      throw new Error('Rows must be 0, or between 3 and 90');
    }

    result.push(
        {
          type: 'pdf417',
          value: `rows: ${options.rows}, columns: ${options.columns}`,
          payload: [0x1b, 0x1d, 0x78, 0x53, 0x30, 0x01, options.rows, options.columns],
        },
    );

    /* Width */

    if (typeof options.width !== 'number') {
      throw new Error('Width must be a number');
    }

    if (options.width < 2 || options.width > 8) {
      throw new Error('Width must be between 2 and 8');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'width',
          value: options.width,
          payload: [0x1b, 0x1d, 0x78, 0x53, 0x32, options.width],
        },
    );

    /* Height */

    if (typeof options.height !== 'number') {
      throw new Error('Height must be a number');
    }

    if (options.height < 2 || options.height > 8) {
      throw new Error('Height must be between 2 and 8');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'height',
          value: options.height,
          payload: [0x1b, 0x1d, 0x78, 0x53, 0x33, options.height],
        },
    );

    /* Error level */

    if (typeof options.errorlevel !== 'number') {
      throw new Error('Errorlevel must be a number');
    }

    if (options.errorlevel < 0 || options.errorlevel > 8) {
      throw new Error('Errorlevel must be between 0 and 8');
    }

    result.push(
        {
          type: 'pdf417',
          property: 'errorlevel',
          value: options.errorlevel,
          payload: [0x1b, 0x1d, 0x78, 0x53, 0x31, options.errorlevel],
        },
    );

    /* Data */

    const bytes = CodepageEncoder.encode(value, 'ascii');
    const length = bytes.length;

    result.push(
        {
          type: 'pdf417',
          property: 'data',
          value,
          payload: [
            0x1b, 0x1d, 0x78, 0x44,
            length & 0xff, (length >> 8) & 0xff,
            ...bytes,
          ],
        },
    );

    /* Print PDF417 code */

    result.push(
        {
          type: 'pdf417',
          command: 'print',
          payload: [0x1b, 0x1d, 0x78, 0x50],
        },
    );

    return result;
  }

  /**
     * Encode an image
     * @param {ImageData} image     ImageData object
     * @param {number} width        Width of the image
     * @param {number} height       Height of the image
     * @param {string} mode         Image encoding mode (value is ignored)
     * @return {Array}             Array of bytes to send to the printer
     */
  image(image, width, height, mode) {
    const result = [];

    const getPixel = (x, y) => typeof image.data[((width * y) + x) * 4] === 'undefined' ||
                                      image.data[((width * y) + x) * 4] > 0 ? 0 : 1;

    result.push(...this.lineSpacing('none'));

    for (let s = 0; s < height / 24; s++) {
      const y = s * 24;
      const bytes = new Uint8Array(width * 3);

      for (let x = 0; x < width; x++) {
        const i = x * 3;

        bytes[i] =
                    getPixel(x, y + 0) << 7 |
                    getPixel(x, y + 1) << 6 |
                    getPixel(x, y + 2) << 5 |
                    getPixel(x, y + 3) << 4 |
                    getPixel(x, y + 4) << 3 |
                    getPixel(x, y + 5) << 2 |
                    getPixel(x, y + 6) << 1 |
                    getPixel(x, y + 7);

        bytes[i + 1] =
                    getPixel(x, y + 8) << 7 |
                    getPixel(x, y + 9) << 6 |
                    getPixel(x, y + 10) << 5 |
                    getPixel(x, y + 11) << 4 |
                    getPixel(x, y + 12) << 3 |
                    getPixel(x, y + 13) << 2 |
                    getPixel(x, y + 14) << 1 |
                    getPixel(x, y + 15);

        bytes[i + 2] =
                    getPixel(x, y + 16) << 7 |
                    getPixel(x, y + 17) << 6 |
                    getPixel(x, y + 18) << 5 |
                    getPixel(x, y + 19) << 4 |
                    getPixel(x, y + 20) << 3 |
                    getPixel(x, y + 21) << 2 |
                    getPixel(x, y + 22) << 1 |
                    getPixel(x, y + 23);
      }

      result.push(
          {
            type: 'image',
            property: 'data',
            value: 'column',
            width,
            height: 24,
            payload: [
              0x1b, 0x58,
              width & 0xff, (width >> 8) & 0xff,
              ...bytes,
              0x0a, 0x0d,
            ],
          },
      );
    }

    result.push(...this.lineSpacing('default'));

    return result;
  }

  /**
     * Cut the paper
     * @param {string} value    Cut type ('full' or 'partial')
     * @return {Array}         Array of bytes to send to the printer
     */
  cut(value) {
    let data = 0x00;

    if (value == 'partial') {
      data = 0x01;
    }

    return [
      {
        type: 'cut',
        payload: [0x1b, 0x64, data],
      },
    ];
  }

  /**
     * Send a pulse to the cash drawer
     * @param {number} device   Device number
     * @param {number} on       Pulse ON time
     * @param {number} off      Pulse OFF time
     * @return {Array}         Array of bytes to send to the printer
     */
  pulse(device, on, off) {
    if (typeof device === 'undefined') {
      device = 0;
    }

    if (typeof on === 'undefined') {
      on = 200;
    }

    if (typeof off === 'undefined') {
      off = 200;
    }

    on = Math.min(127, Math.round(on / 10));
    off = Math.min(127, Math.round(off / 10));

    return [
      {
        type: 'pulse',
        payload: [0x1b, 0x07, on & 0xff, off & 0xff, device ? 0x1a : 0x07],
      },
    ];
  }

  /**
     * Enable or disable bold text
     * @param {boolean} value   Enable or disable bold text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  bold(value) {
    let data = 0x46;

    if (value) {
      data = 0x45;
    }

    return [
      0x1b, data,
    ];
  }

  /**
     * Enable or disable underline text
     * @param {boolean} value   Enable or disable underline text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  underline(value) {
    let data = 0x00;

    if (value) {
      data = 0x01;
    }

    return [
      0x1b, 0x2d, data,
    ];
  }

  /**
     * Enable or disable italic text
     * @param {boolean} value   Enable or disable italic text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  italic(value) {
    return [];
  }

  /**
     * Enable or disable inverted text
     * @param {boolean} value   Enable or disable inverted text, optional, default toggles between states
     * @return {Array}         Array of bytes to send to the printer
     */
  invert(value) {
    let data = 0x35;

    if (value) {
      data = 0x34;
    }

    return [
      0x1b, data,
    ];
  }

  /**
     * Change text size
     * @param {number} width    Width of the text (1-8)
     * @param {number} height   Height of the text (1-8)
     * @return {Array}         Array of bytes to send to the printer
     */
  size(width, height) {
    return [
      0x1b, 0x69, height - 1, width - 1,
    ];
  }

  /**
     * Change the codepage
     * @param {number} value    Codepage value
     * @return {Array}         Array of bytes to send to the printer
     */
  codepage(value) {
    return [
      0x1b, 0x1d, 0x74, value,
    ];
  }

  /**
     * Flush the printers line buffer
     * @return {Array}         Array of bytes to send to the printer
     */
  flush() {
    return [
      {
        type: 'print-mode',
        value: 'page',
        payload: [0x1b, 0x1d, 0x50, 0x30],
      },
      {
        type: 'print-mode',
        value: 'line',
        payload: [0x1b, 0x1d, 0x50, 0x31],
      },
    ];
  }
}

/**
 * Store and manage text styles
 */
class TextStyle {
  #default = {
    bold: false,
    italic: false,
    underline: false,
    invert: false,
    width: 1,
    height: 1,
  };

  #current;
  #callback;

  /**
     * Create a new TextStyle object
     *
     * @param  {object}   options   Object containing configuration options
     *                              - callback: called with every style change
     *                              - defaults: style properties that override the defaults
     */
  constructor(options) {
    /* The defaults can be overridden, for example by a table cell that inherits the style of the table */

    this.#default = Object.assign({}, this.#default, options.defaults || {});
    this.#current = structuredClone(this.#default);
    this.#callback = options.callback || (() => {});
  }

  /**
     * Get the default value of a style property
     *
     * @param  {string}   property   The property, 'size' for the combined width and height
     * @return {boolean|object}      The default value
     */
  getDefault(property) {
    if (property === 'size') {
      return {width: this.#default.width, height: this.#default.height};
    }

    return this.#default[property];
  }

  /**
     * Return commands to get to the default style from the current style
     *
     * @return {array}   Array of modified properties
     */
  store() {
    const result = [];

    const properties = new Map();

    for (const property in this.#current) {
      if (this.#current[property] !== this.#default[property]) {
        if (property === 'width' || property === 'height') {
          properties.set('size', {width: this.#default.width, height: this.#default.height});
        } else {
          properties.set(property, this.#default[property]);
        }
      }
    }

    for (const property of properties) {
      result.push({
        type: 'style',
        property: property[0],
        value: property[1],
      });
    }

    return result;
  }

  /**
     * Return commands to get to the current style from the default style
     *
     * @return {array}   Array of modified properties
     */
  restore() {
    const result = [];

    const properties = new Map();

    for (const property in this.#current) {
      if (this.#current[property] !== this.#default[property]) {
        if (property === 'width' || property === 'height') {
          properties.set('size', {width: this.#current.width, height: this.#current.height});
        } else {
          properties.set(property, this.#current[property]);
        }
      }
    }

    for (const property of properties) {
      result.push({
        type: 'style',
        property: property[0],
        value: property[1],
      });
    }

    return result;
  }

  /**
     * Set the bold property
     *
     * @param  {boolean}   value   Is bold enabled, or not?
     */
  set bold(value) {
    if (value !== this.#current.bold) {
      this.#current.bold = value;

      this.#callback({
        type: 'style',
        property: 'bold',
        value,
      });
    }
  }

  /**
     * Get the bold property
     *
     * @return {boolean}   Is bold enabled, or not?
     */
  get bold() {
    return this.#current.bold;
  }

  /**
     * Set the italic property
     *
     * @param  {boolean}   value   Is italic enabled, or not?
     */
  set italic(value) {
    if (value !== this.#current.italic) {
      this.#current.italic = value;

      this.#callback({
        type: 'style',
        property: 'italic',
        value,
      });
    }
  }

  /**
     * Get the italic property
     *
     * @return {boolean}   Is italic enabled, or not?
     */
  get italic() {
    return this.#current.italic;
  }

  /**
     * Set the underline property
     *
     * @param  {boolean}   value   Is underline enabled, or not?
     */
  set underline(value) {
    if (value !== this.#current.underline) {
      this.#current.underline = value;

      this.#callback({
        type: 'style',
        property: 'underline',
        value,
      });
    }
  }

  /**
     * Get the underline property
     *
     * @return {boolean}   Is underline enabled, or not?
     */
  get underline() {
    return this.#current.underline;
  }

  /**
     * Set the invert property
     *
     * @param  {boolean}   value   Is invert enabled, or not?
     */
  set invert(value) {
    if (value !== this.#current.invert) {
      this.#current.invert = value;

      this.#callback({
        type: 'style',
        property: 'invert',
        value,
      });
    }
  }

  /**
     * Get the invert property
     *
     * @return {boolean}   Is invert enabled, or not?
     */
  get invert() {
    return this.#current.invert;
  }

  /**
    * Set the width property
    *
    * @param  {number}   value   The width of a character
    */
  set width(value) {
    if (value !== this.#current.width) {
      this.#current.width = value;

      this.#callback({
        type: 'style',
        property: 'size',
        value: {width: this.#current.width, height: this.#current.height},
      });
    }
  }

  /**
   * Get the width property
   *
   * @return {number}   The width of a character
   */
  get width() {
    return this.#current.width;
  }

  /**
    * Set the height property
    *
    * @param  {number}   value   The height of a character
    */
  set height(value) {
    if (value !== this.#current.height) {
      this.#current.height = value;

      this.#callback({
        type: 'style',
        property: 'size',
        value: {width: this.#current.width, height: this.#current.height},
      });
    }
  }

  /**
   * Get the height property
   *
   * @return {number}   The height of a character
   */
  get height() {
    return this.#current.height;
  }
}

/**
 * Wrap text into lines of a specified width.
 *
 * Whitespace is handled by the following rules:
 *
 * - Whitespace between two words is a separator. When the second word fits on
 *   the line, the separator is printed. When the second word wraps, the
 *   separator becomes the newline and is not printed.
 * - Whitespace before the first word of a line is literal and printed as
 *   indentation, unless the line continues an existing line on the printer,
 *   in which case it is a separator between the existing content and the word.
 * - Whitespace after the last word of a line is literal and printed.
 * - Literal whitespace never causes a wrap, it is clipped at the edge of the line.
 * - Non-breaking spaces are part of words.
 */
class TextWrap {
  /**
     * Static function to wrap text into lines of a specified width.
     *
     * @param  {string}   value     Text to wrap
     * @param  {object}   options   Object containing configuration options
     * @return {array}              Array of lines
     */
  static wrap(value, options) {
    const result = [];
    const width = options.width || 1;
    const columns = options.columns || 42;
    const indent = options.indent || 0;

    const lines = String(value).split(/\r\n|\n/g);

    for (let l = 0; l < lines.length; l++) {
      let line = [];

      /* Only the first line can continue an existing line on the printer */

      let length = l === 0 ? indent : 0;

      /* Whitespace that is waiting for the next word, to decide if it is printed */

      let separator = null;

      /* Split the line into words and whitespace, a non-breaking space is part of a word */

      const tokens = lines[l].match(/[^ \t\f\v-]+?-\b|[^ \t\f\v]+|[ \t\f\v]+/g) || [];

      /* Add literal whitespace to the line, clipped at the edge of the line */

      const literal = (whitespace) => {
        const fit = Math.floor((columns - length) / width);

        if (fit > 0) {
          line.push(whitespace.slice(0, fit));
          length += Math.min(fit, whitespace.length) * width;
        }
      };

      for (const token of tokens) {
        /* Whitespace */

        if (/^[ \t\f\v]+$/.test(token)) {
          if (line.length === 0 && length === 0) {
            literal(token);
          } else {
            separator = token;
          }

          continue;
        }

        /* The word fits on the line, including the separator before it */

        const separatorLength = separator ? separator.length * width : 0;

        if (length + separatorLength + (token.length * width) <= columns) {
          if (separator) {
            line.push(separator);
            length += separatorLength;
            separator = null;
          }

          line.push(token);
          length += token.length * width;

          continue;
        }

        /* The word is longer than the line */

        if (token.length * width > columns) {
          const letters = token.split('');
          let piece;
          const pieces = [];

          /* If there are at least 8 positions remaining, break early */

          const remaining = columns - length - separatorLength;

          if (remaining > 8 * width) {
            if (separator) {
              line.push(separator);
              length += separatorLength;
            }

            piece = letters.splice(0, Math.floor(remaining / width)).join('');

            line.push(piece);
            result.push(line);

            line = [];
            length = 0;
          }

          separator = null;

          /* The remaining letters can be split into pieces the size of the width */

          while ((piece = letters.splice(0, Math.floor(columns / width))).length) {
            pieces.push(piece.join(''));
          }

          for (const piece of pieces) {
            if (length + (piece.length * width) > columns) {
              result.push(line);
              line = [];
              length = 0;
            }

            line.push(piece);
            length += piece.length * width;
          }

          continue;
        }

        /* The word fits on the next line, the separator becomes the newline */

        separator = null;

        result.push(line);
        line = [];
        length = 0;

        line.push(token);
        length += token.length * width;
      }

      /* Whitespace after the last word is literal */

      if (separator) {
        literal(separator);
      }

      result.push(line);
    }

    return result.map((line) => line.join(''));
  }
}

/* Item types that only change the state of the printer and print nothing */

const STATE_TYPES = [
  'style', 'align', 'font', 'initialize', 'character-mode', 'codepage', 'line-spacing', 'motion-unit', 'print-mode', 'raw',
];

/* Item types that must precede the alignment padding of a line when they are
   pending at its start, because they change how the padding is printed */

const LEADING_TYPES = ['font', 'codepage', 'character-mode', 'line-spacing', 'motion-unit', 'print-mode'];

/* Item types that a text style applies to */

const STYLED_TYPES = ['text', 'space', 'raw'];

/* Item types that print a block which advances the paper by itself */

const BLOCK_TYPES = ['image', 'barcode', 'qrcode', 'pdf417'];

/* Printed at the end of a line that is cut off, when overflow is 'ellipsis' */

const ELLIPSIS = '...';

/**
 * Compose lines of text and commands
 */
class LineComposer {
  #embedded;
  #columns;
  #align;
  #overflow;
  #callback;

  #cursor = 0;
  #trimmable = false;
  #clipped = false;
  #stored;
  #buffer = [];


  /**
     * Create a new LineComposer object
     *
     * @param  {object}   options   Object containing configuration options
     */
  constructor(options) {
    this.#embedded = options.embedded || false;
    this.#columns = options.columns || 42;
    this.#align = options.align || 'left';
    this.#overflow = options.overflow || 'wrap';
    this.#callback = options.callback || (() => {});

    this.style = new TextStyle({
      defaults: options.style,
      callback: (value) => {
        this.add(value, 0);
      },
    });

    this.#stored = this.style.store();
  }

  /**
     * Add text to the line, potentially wrapping it
     *
     * @param  {string}   value   Text to add to the line
     * @param  {number}   codepage   Codepage to use for the text
     */
  text(value, codepage) {
    if (this.#overflow !== 'wrap') {
      this.#textWithoutWrap(value, codepage);
      return;
    }

    const lines = TextWrap.wrap(value, {columns: this.#columns, width: this.style.width, indent: this.#cursor});

    for (let i = 0; i < lines.length; i++) {
      /* Add the line to the buffer */

      if (lines[i].length) {
        this.add({type: 'text', value: lines[i], codepage}, lines[i].length * this.style.width);
      }

      /* A newline in the text ends the current line, even if it is empty. Text
         after the last newline stays on the line, so that it can be continued
         by the next call, and an empty text does nothing at all */

      if (i < lines.length - 1) {
        this.flush({forceNewline: true});
      }
    }
  }

  /**
     * Add text to the line without wrapping it. Text that does not fit is cut
     * off at the edge of the line, when overflow is 'ellipsis' the line ends
     * with an ellipsis instead. A newline in the text still ends the line, the
     * text after it is cut off in the same way.
     *
     * @param  {string}   value   Text to add to the line
     * @param  {number}   codepage   Codepage to use for the text
     */
  #textWithoutWrap(value, codepage) {
    const lines = String(value).split(/\r\n|\n/g);

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length && !this.#clipped) {
        this.#fit(lines[i], codepage);
      }

      if (i < lines.length - 1) {
        this.flush({forceNewline: true});
      }
    }
  }

  /**
     * Add as much of a single line of text as fits on the line
     *
     * @param  {string}   value   Text to add to the line, without newlines
     * @param  {number}   codepage   Codepage to use for the text
     */
  #fit(value, codepage) {
    const width = this.style.width;
    const remaining = this.#columns - this.#cursor;

    /* The text fits */

    if (value.length * width <= remaining) {
      this.add({type: 'text', value, codepage, width}, value.length * width);
      return;
    }

    /* The text does not fit, whatever is added after it is dropped */

    this.#clipped = true;

    if (this.#overflow === 'ellipsis') {
      const needed = ELLIPSIS.length * width;

      /* Make room for the ellipsis, if necessary by removing characters that were added before */

      if (remaining < needed) {
        this.#backtrack(needed - remaining);
      }

      const available = this.#columns - this.#cursor - needed;

      if (available >= 0) {
        const piece = value.slice(0, Math.floor(available / width)).trimEnd();

        if (piece.length) {
          this.add({type: 'text', value: piece, codepage, width}, piece.length * width);
        }

        this.add({type: 'text', value: ELLIPSIS, codepage, width}, needed);
        return;
      }

      /* There is no room for an ellipsis, for example in a column narrower than the ellipsis, so clip instead */
    }

    const piece = value.slice(0, Math.floor((this.#columns - this.#cursor) / width));

    if (piece.length) {
      this.add({type: 'text', value: piece, codepage, width}, piece.length * width);
    }
  }

  /**
     * Remove text and spaces from the end of the line buffer to free up a
     * number of columns. Items that only change the state of the printer are
     * kept. Stops at content that cannot be measured, such as nested tables.
     *
     * @param  {number}   columns   Number of columns to free up
     */
  #backtrack(columns) {
    let freed = 0;

    for (let i = this.#buffer.length - 1; i >= 0 && freed < columns; i--) {
      const item = this.#buffer[i];

      if (STATE_TYPES.includes(item.type)) {
        continue;
      }

      if (typeof item.width !== 'number' || (item.type !== 'text' && item.type !== 'space')) {
        break;
      }

      while (freed < columns && (item.type === 'text' ? item.value.length : item.size) > 0) {
        if (item.type === 'text') {
          item.value = item.value.slice(0, -1);
        } else {
          item.size--;
        }

        freed += item.width;
      }

      if ((item.type === 'text' ? item.value.length : item.size) === 0) {
        this.#buffer.splice(i, 1);
      }
    }

    this.#cursor -= freed;
  }

  /**
   * Add spaces to the line
   *
   * @param {number} size Number of spaces to add to the line
   */
  space(size) {
    /* Without wrapping, spaces are clipped at the edge of the line */

    if (this.#overflow !== 'wrap') {
      size = Math.min(size, Math.floor((this.#columns - this.#cursor) / this.style.width));

      if (size <= 0) {
        return;
      }
    }

    this.add({type: 'space', size, width: this.style.width}, size * this.style.width);
  }

  /**
     * Add raw bytes to to the line
     *
     * @param  {array}   value   Array of bytes to add to the line
     * @param  {number}  length  Length in characters of the value
     */
  raw(value, length) {
    this.add({type: 'raw', payload: value}, length || 0);
  }

  /**
     * Add an item to the line buffer, potentially flushing it
     *
     * @param  {object}   value   Item to add to the line buffer
     * @param  {number}   length  Length in characters of the value
     */
  add(value, length) {
    if (value instanceof Array) {
      for (const item of value) {
        this.add(item);
      }

      this.#cursor += length || 0;
      this.#trimmable = false;
      return;
    }

    length = length || 0;

    if (length + this.#cursor > this.#columns) {
      this.flush();
    }

    this.#cursor += length;
    this.#buffer = this.#buffer.concat(value);

    /* Only a trailing space of text added with text() can be trimmed for right
       alignment, the padding of table cells and boxes is part of the layout */

    this.#trimmable = value.type === 'text';
  }

  /**
     * Move the cursor to the end of the line, forcing a flush
     * with the next item to add to the line buffer
     */
  end() {
    this.#cursor = this.#columns;
  }

  /**
     * Determine if a list of items contains printable content, or only
     * commands that change the state of the printer, such as styles,
     * fonts or alignment. Raw commands are not considered content, if
     * they contain printable data the caller is responsible for the newline.
     *
     * @param  {object[]}   items   The items of a line
     * @return {boolean}            True if the line contains printable content
     */
  static hasContent(items) {
    return items.some((item) => !STATE_TYPES.includes(item.type));
  }

  /**
     * Determine if a line contains a block that advances the paper by itself,
     * such as an image, barcode, QR code or PDF417 code, and nothing else
     * that is printable
     *
     * @param  {object[]}   items   The items of a line
     * @return {boolean}            True if the line is a self advancing block
     */
  static isBlock(items) {
    return items.some((item) => BLOCK_TYPES.includes(item.type)) &&
      items.every((item) => STATE_TYPES.includes(item.type) || BLOCK_TYPES.includes(item.type));
  }

  /**
     * Fetch the contents of line buffer
     *
     * @param  {options}   options   Options for flushing the buffer
     * @return {array}               Array of items in the line buffer
     */
  fetch(options) {
    /* Unless forced keep style changes for the next line */

    if (this.#cursor === 0 && !options.forceNewline && !options.forceFlush) {
      return [];
    }

    /* Check the alignment of the current line */

    const align = {
      current: this.#align,
      next: null,
    };

    for (let i = 0; i < this.#buffer.length - 1; i++) {
      if (this.#buffer[i].type === 'align' && !this.#buffer[i].payload) {
        align.current = this.#buffer[i].value;
      }
    }

    /* Check the last item in the buffer, to see if it changes the alignment, then save it for the next line */

    if (this.#buffer.length) {
      const last = this.#buffer[this.#buffer.length - 1];

      if (last.type === 'align' && !last.payload) {
        align.next = last.value;
      }
    }

    this.#align = align.current;

    /* Create a clean buffer without alignment changes */

    const buffer = this.#buffer.filter((item) => item.type !== 'align' || item.payload);

    /* Fetch the contents of the line buffer */

    let result = [];

    const restore = this.style.restore();
    const store = this.style.store();

    /* Styles only apply to text, spaces and raw data. On a line without any of
       those, such as a cut, an image or only pending state changes, the style
       commands are left out. The style object carries the state to the next line */

    const styled = buffer.some((item) => STYLED_TYPES.includes(item.type));

    const before = styled ? this.#stored : [];
    const after = styled ? store : [];
    const items = styled ? buffer : buffer.filter((item) => item.type !== 'style');

    /* State commands that were pending before the line started, such as a font
       change, go before the alignment padding. A font change alters the width
       of the characters, so the printer must apply it before it prints the
       spaces, otherwise the line is padded in the width of the previous font.
       The same goes for a code page and for the line spacing, which move ahead
       of a pending style change as well, because the two are independent.
       Only the commands in front of the first item that prints are moved, the
       other state commands keep their place, and raw data stops the hoisting:
       raw bytes are the user's, and what comes after them stays after them */

    const leading = [];
    const trailing = [];

    let printing = false;

    for (const item of items) {
      if (!printing && (!STATE_TYPES.includes(item.type) || item.type === 'raw')) {
        printing = true;
      }

      if (!printing && LEADING_TYPES.includes(item.type)) {
        leading.push(item);
      } else {
        trailing.push(item);
      }
    }

    if (this.#cursor === 0 && (options.ignoreAlignment || !this.#embedded)) {
      result = this.#merge([
        ...before,
        ...items,
        ...after,
      ]);
    } else {
      if (this.#align === 'right') {
        let last;

        /* Find index of last text or space element */

        for (let i = buffer.length - 1; i >= 0; i--) {
          if (buffer[i].type === 'text' || buffer[i].type === 'space') {
            last = i;
            break;
          }
        }

        /* Remove a trailing space from text, so that it ends at the edge of the paper */

        if (typeof last === 'number' && this.#trimmable) {
          if (buffer[last].type === 'text' && buffer[last].value.endsWith(' ')) {
            buffer[last].value = buffer[last].value.slice(0, -1);
            this.#cursor -= this.style.width;
          }
        }

        result = this.#merge([
          ...leading,
          ...this.#padding(this.#columns - this.#cursor),
          ...before,
          ...trailing,
          ...after,
        ]);
      }

      if (this.#align === 'center') {
        const left = Math.max(0, this.#columns - this.#cursor) >> 1;

        result = this.#merge([
          ...leading,
          ...this.#padding(left),
          ...before,
          ...trailing,
          ...after,
          ...this.#padding(this.#embedded ? this.#columns - this.#cursor - left : 0),
        ]);
      }

      if (this.#align === 'left') {
        result = this.#merge([
          ...before,
          ...items,
          ...after,
          ...this.#padding(this.#embedded ? this.#columns - this.#cursor : 0),
        ]);
      }
    }

    this.#stored = restore;
    this.#buffer = [];
    this.#cursor = 0;
    this.#trimmable = false;
    this.#clipped = false;

    if (options.forceNewline && !LineComposer.hasContent(result)) {
      result.push({type: 'empty'});
    }

    if (align.next) {
      this.#align = align.next;
    }

    return result;
  }

  /**
     * Flush the contents of the line buffer
     *
     * @param  {options}   options   Options for flushing the buffer
     */
  flush(options) {
    options = Object.assign({
      forceNewline: false,
      forceFlush: false,
      ignoreAlignment: false,
    }, options || {});

    const result = this.fetch(options);

    if (result.length) {
      this.#callback(result);
    }
  }

  /**
     * Padding for a number of columns, in single width spaces. Padding is
     * printed in the default style of this composer, which is the style
     * inherited by a table cell or box. When that style has double width,
     * single width spaces need a temporary size change, otherwise an odd
     * number of columns could not be filled.
     *
     * @param  {number}   columns   Number of columns to fill
     * @return {array}              Array of items
     */
  #padding(columns) {
    return LineComposer.padding(columns, this.style.getDefault('size'));
  }

  /**
     * Padding for a number of columns, in single width spaces, see #padding()
     *
     * @param  {number}   columns   Number of columns to fill
     * @param  {object}   size      The size in which the padding is printed, with a width and height
     * @return {array}              Array of items
     */
  static padding(columns, size) {
    if (columns <= 0) {
      return [];
    }

    if (size.width === 1) {
      return [{type: 'space', size: columns}];
    }

    return [
      {type: 'style', property: 'size', value: {width: 1, height: size.height}},
      {type: 'space', size: columns},
      {type: 'style', property: 'size', value: {width: size.width, height: size.height}},
    ];
  }

  /**
     * Merge text items and spaces in the line buffer
     *
     * @param  {array}   items   Array of items
     * @return {array}           Array of merged items
     */
  #merge(items) {
    const result = [];
    let last = -1;

    for (let item of items) {
      if (item.type === 'space') {
        if (item.size === 0) {
          continue;
        }

        item = {type: 'text', value: ' '.repeat(item.size), codepage: null};
      }

      if (item.type === 'text') {
        /* Check if we can merge the text with the last item */

        const allowMerge =
            last >= 0 &&
            result[last].type === 'text' &&
            (
              result[last].codepage === item.codepage ||
              result[last].codepage === null ||
              item.codepage === null
            );

        if (allowMerge) {
          result[last].value += item.value;
          result[last].codepage = result[last].codepage || item.codepage;
          continue;
        }

        result.push(item);
        last++;
      } else if (item.type === 'style') {
        /* Consecutive changes of the same property collapse into the last one */

        const allowMerge =
          last >= 0 &&
          result[last].type === 'style' &&
          result[last].property === item.property;

        if (allowMerge) {
          result[last] = item;
          continue;
        }

        result.push(item);
        last++;
      } else {
        result.push(item);
        last++;
      }
    }

    return this.#dedupe(result);
  }

  /**
     * Remove style commands that set a property to the value the printer
     * already has. Every line starts in the default style.
     *
     * @param  {array}   items   Array of items
     * @return {array}           Array of items without redundant style commands
     */
  #dedupe(items) {
    const result = [];
    const state = new Map();

    const equal = (a, b) => (typeof a === 'object' && a !== null) ?
      a.width === b.width && a.height === b.height :
      a === b;

    for (const item of items) {
      if (item.type === 'style') {
        const current = state.has(item.property) ? state.get(item.property) : this.style.getDefault(item.property);

        if (equal(current, item.value)) {
          continue;
        }

        state.set(item.property, item.value);
      }

      result.push(item);
    }

    return result;
  }

  /**
   * Get the current position of the cursor
   *
   * @return {number}   Current position of the cursor
   */
  get cursor() {
    return this.#cursor;
  }

  /**
   * Determine if nothing has been added to the line buffer yet
   *
   * @return {boolean}   True if the line buffer is empty
   */
  get empty() {
    return this.#buffer.length === 0 && this.#cursor === 0;
  }

  /**
   * Set the alignment of the current line
   *
   * @param  {string}   value   Text alignment, can be 'left', 'center', or 'right'
   */
  set align(value) {
    this.add({type: 'align', value}, 0);
  }

  /**
   * Get the alignment of the current line
   *
   * @return {string}   Text alignment, can be 'left', 'center', or 'right'
   */
  get align() {
    let align = this.#align;

    for (let i = 0; i < this.#buffer.length; i++) {
      if (this.#buffer[i].type === 'align') {
        align = this.#buffer[i].value;
      }
    }

    return align;
  }

  /**
   * Set the number of columns of the current line
   *
   * @param  {number}   value   columns of the line
   */
  set columns(value) {
    this.#columns = value;
  }

  /**
   * Get the number of columns of the current line
   *
   * @return {number}   columns of the line
   */
  get columns() {
    return this.#columns;
  }
}

/* The eleven shapes a border is drawn with, named after the edge of the box
   or table they sit on: the four corners, the four junctions on an edge, the
   junction in the middle and the two straight lines.

   Every shape exists for each combination of the style of the horizontal line
   that runs through it and the style of the vertical line that runs through
   it, because the frame of a table and the lines between its cells have a
   style of their own. The two pure sets are the box drawing glyphs of a single
   and of a double line, the two mixed sets are the glyphs of cp437 that join a
   single line to a double one */

const SINGLE = {
  horizontal: '─',
  vertical: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  left: '├',
  right: '┤',
  top: '┬',
  bottom: '┴',
  middle: '┼',
};

const DOUBLE = {
  horizontal: '═',
  vertical: '║',
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  left: '╠',
  right: '╣',
  top: '╦',
  bottom: '╩',
  middle: '╬',
};

/* A double horizontal line crossing single vertical rules */

const DOUBLE_HORIZONTAL = {
  horizontal: '═',
  vertical: '│',
  topLeft: '╒',
  topRight: '╕',
  bottomLeft: '╘',
  bottomRight: '╛',
  left: '╞',
  right: '╡',
  top: '╤',
  bottom: '╧',
  middle: '╪',
};

/* A single horizontal line crossing double vertical rules */

const DOUBLE_VERTICAL = {
  horizontal: '─',
  vertical: '║',
  topLeft: '╓',
  topRight: '╖',
  bottomLeft: '╙',
  bottomRight: '╜',
  left: '╟',
  right: '╢',
  top: '╥',
  bottom: '╨',
  middle: '╫',
};

/* The set of shapes for every combination of a horizontal and a vertical style */

const SHAPES = {
  single: {single: SINGLE, double: DOUBLE_VERTICAL},
  double: {single: DOUBLE_HORIZONTAL, double: DOUBLE},
};

const ROUNDED = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
};

/* The shapes of a printer without a page that has the line drawing glyphs */

const ASCII = {
  horizontal: '-',
  vertical: '|',
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  left: '+',
  right: '+',
  top: '+',
  bottom: '+',
  middle: '+',
};

/* The code page the square borders are drawn in, when the printer has it.
   Every printer language the encoder supports has cp437 in its mapping */

const DEFAULT_CODEPAGE = 'cp437';

/* A glyph that a code page does not have is encoded as a question mark */

const MISSING = 0x3f;

/**
 * The glyphs a box or a table draws its borders with.
 *
 * The rounded corners are not in cp437, they come from the code page of the
 * printer that has them: the Katakana page of Epson compatible printers, which
 * has the straight lines as well, or the standard page of Star printers, which
 * has only the corners. Which page that is depends on the code page mapping of
 * the printer, so it is looked up once for every encoder and the straight lines
 * stay in cp437 when the page that has the corners does not have them.
 *
 * Everything with a double line in it, the junctions of a double line and a
 * single one included, is drawn from the page that has the double glyphs, which
 * is cp437 on every printer the encoder knows.
 *
 * A printer without a page with rounded corners silently draws square corners,
 * and a printer without a page with the line drawing glyphs at all draws its
 * borders in ASCII, with dashes, bars and plus signs.
 */
class Border {
  #corners = null;
  #straight = null;
  #single = DEFAULT_CODEPAGE;
  #double = DEFAULT_CODEPAGE;
  #fallback = DEFAULT_CODEPAGE;

  /**
     * Create a new Border object for a code page mapping
     *
     * @param  {object}   mapping   The code page mapping of the printer
     */
  constructor(mapping) {
    const codepages = Object.keys(mapping || {});

    /* The pages the straight lines are drawn in. Every printer the encoder
       knows has cp437, a mapping without it falls back to a page that has
       the glyphs, and to its first page when it has none of them */

    this.#single = Border.#page(codepages, Object.values(SINGLE).join(''));
    this.#double = Border.#page(codepages, [DOUBLE, DOUBLE_HORIZONTAL, DOUBLE_VERTICAL]
        .map((shapes) => Object.values(shapes).join('')).join(''));
    this.#fallback = codepages[0] || DEFAULT_CODEPAGE;

    /* The first page that has the rounded corners is used for the corners, a
       page that has the straight lines as well is preferred, so that a border
       on a printer that has them is drawn in one page from end to end */

    for (const codepage of codepages) {
      if (!Border.#encodes(codepage, Object.values(ROUNDED).join(''))) {
        continue;
      }

      if (this.#corners === null) {
        this.#corners = codepage;
      }

      if (Border.#encodes(codepage, Object.values(SINGLE).join(''))) {
        this.#corners = codepage;
        this.#straight = codepage;
        break;
      }
    }
  }

  /**
     * Determine the page a set of border glyphs is drawn in: cp437 when the
     * mapping has it, otherwise the first page of the mapping that has every
     * glyph, or null when the printer has none of them
     *
     * @param  {string[]}   codepages   The code pages of the mapping
     * @param  {string}     glyphs      The glyphs that have to be encoded
     * @return {string|null}            The name of the code page, or null
     */
  static #page(codepages, glyphs) {
    if (codepages.includes(DEFAULT_CODEPAGE)) {
      return DEFAULT_CODEPAGE;
    }

    return codepages.find((codepage) => Border.#encodes(codepage, glyphs)) || null;
  }

  /**
     * Determine if a code page has every glyph of a string
     *
     * @param  {string}   codepage   The code page to check
     * @param  {string}   value      The glyphs that the code page must have
     * @return {boolean}             True if the code page has all of them
     */
  static #encodes(codepage, value) {
    let bytes;

    try {
      bytes = CodepageEncoder.encode(value, codepage);
    } catch (e) {
      return false;
    }

    return bytes.length === value.length && !bytes.includes(MISSING);
  }

  /**
     * Get the glyph and the code page for every shape of a border, for one
     * combination of the style of the horizontal line and the style of the
     * vertical line that meet in it. A box and the outline of a table use the
     * same style on both axes, a junction of the frame of a table and a rule
     * row between its cells can have one style per axis
     *
     * @param  {string}   horizontal   The style of the horizontal line, 'single' or 'double'
     * @param  {string}   vertical     The style of the vertical line, 'single' or 'double'
     * @param  {string}   [corners]    The style of the corners, 'square' or 'rounded'
     * @return {object}                An object with a glyph and a codepage for every shape
     */
  glyphs(horizontal, vertical, corners) {
    const across = horizontal === 'double' ? 'double' : 'single';
    const down = vertical === 'double' ? 'double' : 'single';

    /* Anything with a double line in it is drawn from the page that has the
       double glyphs, the lines that are single everywhere from the page that
       has the single ones */

    const double = across === 'double' || down === 'double';
    const straight = double ? this.#double : this.#single;

    /* A printer that cannot draw the lines draws the whole border in ASCII */

    if (straight === null) {
      return Object.fromEntries(Object.entries(ASCII)
          .map(([name, glyph]) => [name, {glyph, codepage: this.#fallback}]));
    }

    const rounded = !double && corners === 'rounded' && this.#corners !== null;
    const shapes = Object.assign({}, SHAPES[across][down], rounded ? ROUNDED : {});

    const result = {};

    for (const [name, glyph] of Object.entries(shapes)) {
      let codepage = straight;

      if (rounded) {
        codepage = name in ROUNDED ? this.#corners : this.#straight || straight;
      }

      result[name] = {glyph, codepage};
    }

    return result;
  }
}

/* Type definitions */

/** @typedef {'bold' | 'italic' | 'underline' | 'invert'} MarkdownStyle */

/** @typedef {{type: 'text', value: string}} MarkdownTextNode */
/** @typedef {{type: 'style', style: MarkdownStyle, content: MarkdownNode[]}} MarkdownStyleNode */
/** @typedef {MarkdownTextNode | MarkdownStyleNode} MarkdownNode */

/** @typedef {{type: 'blank'}} MarkdownBlank */
/** @typedef {{type: 'paragraph', content: MarkdownNode[]}} MarkdownParagraph */
/** @typedef {{type: 'heading', level: number, content: MarkdownNode[]}} MarkdownHeading */
/** @typedef {{type: 'rule'}} MarkdownRule */

/**
 * @typedef {Object} MarkdownTable
 * @property {'table'} type
 * @property {('left' | 'center' | 'right')[]} align   The alignment of every column
 * @property {number[]} widths                         The width of the longest cell of every column
 * @property {MarkdownNode[][]} [header]               The cells of the header row, if it has content
 * @property {MarkdownNode[][][]} rows                 The cells of every body row
 */

/** @typedef {{marker: string, content: MarkdownNode[]}} MarkdownListItem */

/**
 * @typedef {Object} MarkdownList
 * @property {'list'} type
 * @property {number} width            The width of the marker column, including the space after the marker
 * @property {MarkdownListItem[]} items
 */

/**
 * @typedef {MarkdownBlank | MarkdownParagraph | MarkdownHeading | MarkdownRule |
 *           MarkdownTable | MarkdownList} MarkdownBlock
 */

/* The inline delimiters, with the style they set and whether they only open
   and close at a word boundary. A delimiter is looked up by an exact match of
   the run of its character, so the order of this list does not matter */

const DELIMITERS = [
  {delimiter: '**', style: 'bold', boundary: false},
  {delimiter: '__', style: 'underline', boundary: true},
  {delimiter: '==', style: 'invert', boundary: false},
  {delimiter: '*', style: 'italic', boundary: false},
  {delimiter: '_', style: 'italic', boundary: true},
];

/* The characters a backslash can escape, the ASCII punctuation of Markdown */

const PUNCTUATION = /^[!-/:-@[-`{-~]$/;

/* A character that is part of a word, which a _ or __ delimiter cannot touch */

const ALPHANUMERIC = /^[\p{L}\p{N}]$/u;

/* Whitespace an opening delimiter cannot be followed by, and a closing delimiter cannot be preceded by */

const WHITESPACE = /^\s$/;

/* A heading, which needs a space after its hashes */

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;

/* Three or more of the same character, with spaces between them allowed and nothing else on the line */

const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/* A list item, either unordered or numbered */

const ITEM = /^([ \t]*)([-*+]|\d{1,9})([.)]?)[ \t]+(.*)$/;

/* The line below the header of a table, which gives the alignment of every column */

const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/* The indentation of a nested list item, in spaces per level */

const INDENT = 2;


/**
 * Parse a subset of GitHub Flavored Markdown into blocks and inline runs.
 *
 * The subset is line based: every line of the source is a line on paper, a
 * blank line is an empty line and inline styles never cross a line. See the
 * Markdown section of the documentation for the constructs it supports.
 */
class Markdown {
  /**
     * Parse a Markdown document into a list of blocks
     *
     * @param  {string}            value   The Markdown source
     * @return {MarkdownBlock[]}           The blocks of the document
     */
  static parse(value) {
    const lines = Markdown.#lines(value);
    const blocks = [];

    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      /* A blank line */

      if (line.trim().length === 0) {
        blocks.push({type: 'blank'});
        index++;
        continue;
      }

      /* A heading */

      const heading = line.match(HEADING);

      if (heading) {
        blocks.push({type: 'heading', level: heading[1].length, content: Markdown.#inline(heading[2])});
        index++;
        continue;
      }

      /* A horizontal rule */

      if (RULE.test(line)) {
        blocks.push({type: 'rule'});
        index++;
        continue;
      }

      /* A table, which is a header row, a delimiter row and its body rows */

      const table = Markdown.#table(lines, index);

      if (table) {
        blocks.push(table.block);
        index = table.end;
        continue;
      }

      /* A list, which runs until a blank line or a line that is not an item */

      const list = Markdown.#list(lines, index);

      if (list) {
        blocks.push(list.block);
        index = list.end;
        continue;
      }

      /* Anything else is inline content */

      blocks.push({type: 'paragraph', content: Markdown.#inline(line)});
      index++;
    }

    return blocks;
  }

  /**
     * The plain text of a list of inline nodes, without any of the markup,
     * which is what the width of a table column is measured against
     *
     * @param  {MarkdownNode[]}   nodes   The inline nodes
     * @return {string}                   The text of the nodes
     */
  static #text(nodes) {
    return nodes.map((node) => node.type === 'text' ? node.value : Markdown.#text(node.content)).join('');
  }

  /**
     * Fit the columns of a table in the space that is available: every column
     * is as wide as its longest cell, and as long as they do not fit together
     * the widest column loses one character, which makes its text wrap
     *
     * @param  {number[]}   widths      The width of the longest cell of every column
     * @param  {number}     available   The space that is available for the columns
     * @return {number[]}               The width of every column
     */
  static fit(widths, available) {
    const result = widths.map((width) => Math.max(1, width));

    let total = result.reduce((sum, width) => sum + width, 0);

    while (total > available) {
      let widest = 0;

      for (let i = 1; i < result.length; i++) {
        if (result[i] > result[widest]) {
          widest = i;
        }
      }

      /* Columns of one character cannot give up anything more */

      if (result[widest] <= 1) {
        break;
      }

      result[widest]--;
      total--;
    }

    return result;
  }

  /**
     * Grow the columns of a table to fill the space that is available: what
     * is left over after the columns have been fitted goes to the widest
     * column, the first of them when several are equally wide, so that a
     * table is as wide as the paper, or as wide as the cell it is printed in.
     * A table whose columns had to be reduced to fit has nothing left over
     * and keeps the widths it was given.
     *
     * @param  {number[]}   widths      The width of every column, as fitted in the space that is available
     * @param  {number}     available   The space that is available for the columns
     * @return {number[]}               The width of every column
     */
  static expand(widths, available) {
    const result = [...widths];
    const total = result.reduce((sum, width) => sum + width, 0);

    if (total >= available) {
      return result;
    }

    let widest = 0;

    for (let i = 1; i < result.length; i++) {
      if (result[i] > result[widest]) {
        widest = i;
      }
    }

    result[widest] += available - total;

    return result;
  }

  /**
     * Split the source into lines. A byte order mark at the start of the
     * source is not content and is dropped. A line break ends a line, so a
     * document that ends with one does not get an empty line at the end, and
     * the hard break of Markdown, a trailing double space or backslash, is
     * stripped because a newline is a newline here anyway
     *
     * @param  {string}     value   The Markdown source
     * @return {string[]}           The lines of the document
     */
  static #lines(value) {
    return String(value)
        .replace(/^\ufeff/, '')
        .replace(/(\r\n|\n|\r)$/, '')
        .split(/\r\n|\n|\r/)
        .map((line) => Markdown.#strip(line));
  }

  /**
     * Strip the hard break at the end of a line: a double space, or a
     * backslash that is not itself escaped
     *
     * @param  {string}   line   One line of the source
     * @return {string}          The line without its hard break
     */
  static #strip(line) {
    const value = line.replace(/[ \t]{2,}$/, '');
    const backslashes = value.match(/\\+$/);

    if (backslashes && backslashes[0].length % 2 === 1) {
      return value.slice(0, -1);
    }

    return value;
  }

  /**
     * Parse a table, if the line at the given position is the header of one.
     * A table is a header row with at least one pipe, a delimiter row with the
     * same number of cells, and body rows until a blank line or a line without
     * a pipe.
     *
     * @param  {string[]}   lines   The lines of the document
     * @param  {number}     index   The position of the header row
     * @return {{block: MarkdownTable, end: number} | null}   The table and the line after it
     */
  static #table(lines, index) {
    if (index + 1 >= lines.length || !/^ {0,3}\S/.test(lines[index])) {
      return null;
    }

    const header = Markdown.#cells(lines[index]);

    if (header === null || !DELIMITER_ROW.test(lines[index + 1])) {
      return null;
    }

    const delimiters = Markdown.#cells(lines[index + 1]);

    /* The delimiter row says how many columns the table has, a header that
       does not match it is not a table but a line of text */

    if (delimiters === null || delimiters.length !== header.length) {
      return null;
    }

    const align = delimiters.map((cell) => {
      const value = cell.trim();

      if (value.endsWith(':')) {
        return value.startsWith(':') ? 'center' : 'right';
      }

      return 'left';
    });

    /* The body runs until a blank line or a line without a pipe */

    const rows = [];

    let end = index + 2;

    while (end < lines.length && lines[end].trim().length > 0) {
      const cells = Markdown.#cells(lines[end]);

      if (cells === null) {
        break;
      }

      rows.push(cells);
      end++;
    }

    /* A row with fewer cells gets empty ones, extra cells are dropped */

    const row = (cells) => Array.from({length: align.length}, (ignore, i) => Markdown.#inline(cells[i] || ''));

    const block = {
      type: 'table',
      align,
      widths: align.map(() => 0),
      rows: rows.map(row),
    };

    /* A header row whose cells are all empty is not printed, which is how a
       table without a header is written */

    if (header.some((cell) => cell.trim().length > 0)) {
      block.header = row(header);
    }

    /* Every column is as wide as its longest cell, header included, measured
       after the markup is removed, in the characters the composer counts */

    for (const cells of [...(block.header ? [block.header] : []), ...block.rows]) {
      cells.forEach((cell, i) => {
        block.widths[i] = Math.max(block.widths[i], Markdown.#text(cell).length);
      });
    }

    return {block, end};
  }

  /**
     * Split one row of a table into its cells. The pipes around the row are
     * optional, an escaped pipe is part of a cell, and a line without a pipe
     * at all is not a row.
     *
     * @param  {string}   line   One line of the source
     * @return {string[] | null}   The cells of the row, or null when the line is not a row
     */
  static #cells(line) {
    let value = line.trim();

    if (!Markdown.#pipes(value)) {
      return null;
    }

    if (value.startsWith('|')) {
      value = value.slice(1);
    }

    if (/[^\\]\|$/.test(value) || value === '|') {
      value = value.slice(0, -1);
    }

    const cells = [];
    let cell = '';

    for (let index = 0; index < value.length; index++) {
      if (value[index] === '\\' && index + 1 < value.length) {
        cell += value.slice(index, index + 2);
        index++;
        continue;
      }

      if (value[index] === '|') {
        cells.push(cell.trim());
        cell = '';
        continue;
      }

      cell += value[index];
    }

    cells.push(cell.trim());

    return cells;
  }

  /**
     * Determine if a line contains a pipe that is not escaped
     *
     * @param  {string}   line   One line of the source
     * @return {boolean}         True when the line contains a pipe
     */
  static #pipes(line) {
    for (let index = 0; index < line.length; index++) {
      if (line[index] === '\\') {
        index++;
        continue;
      }

      if (line[index] === '|') {
        return true;
      }
    }

    return false;
  }

  /**
     * Parse a list, if the line at the given position is an item of one. The
     * list runs until a blank line or a line that is not an item. An item that
     * is indented further than the first item of the list is nested, two
     * spaces per level, and an ordered list counts from the number of its
     * first item.
     *
     * @param  {string[]}   lines   The lines of the document
     * @param  {number}     index   The position of the first item
     * @return {{block: MarkdownList, end: number} | null}   The list and the line after it
     */
  static #list(lines, index) {
    const first = lines[index].match(ITEM);

    if (!first || !Markdown.#isItem(first) || first[1].length > 3) {
      return null;
    }

    const base = first[1].length;
    const items = [];
    const counters = [];

    let end = index;

    while (end < lines.length) {
      const item = lines[end].match(ITEM);

      if (!item || !Markdown.#isItem(item)) {
        break;
      }

      const level = Math.floor(Math.max(0, item[1].length - base) / INDENT);
      const ordered = item[3].length > 0;

      /* The number of an ordered item follows the first item at its level */

      if (ordered && typeof counters[level] === 'undefined') {
        counters[level] = parseInt(item[2], 10);
      }

      const marker = ordered ? `${counters[level]}.` : '-';

      if (ordered) {
        counters[level]++;
      }

      /* An item that is nested deeper starts counting again */

      counters.length = level + 1;

      items.push({
        marker: ' '.repeat(level * INDENT) + marker,
        content: Markdown.#inline(item[4]),
      });

      end++;
    }

    /* The marker column is as wide as the widest marker, plus one space */

    const width = items.reduce((widest, item) => Math.max(widest, item.marker.length), 0) + 1;

    return {block: {type: 'list', width, items}, end};
  }

  /**
     * Determine if a match of the item pattern is really a list item: an
     * unordered marker is a single character, a numbered one ends with a
     * period or a parenthesis
     *
     * @param  {string[]}   item   The match of the item pattern
     * @return {boolean}           True when the line is a list item
     */
  static #isItem(item) {
    return /^[-*+]$/.test(item[2]) ? item[3].length === 0 : item[3].length === 1;
  }

  /**
     * Parse the inline content of one line into text and styled runs
     *
     * @param  {string}            value   One line of the source
     * @return {MarkdownNode[]}            The inline nodes of the line
     */
  static #inline(value) {
    const nodes = [];

    let text = '';
    let index = 0;

    const flush = () => {
      if (text.length > 0) {
        nodes.push({type: 'text', value: text});
        text = '';
      }
    };

    while (index < value.length) {
      const character = value[index];

      /* A backslash escapes the ASCII punctuation that follows it */

      if (character === '\\' && index + 1 < value.length && PUNCTUATION.test(value[index + 1])) {
        text += value[index + 1];
        index += 2;
        continue;
      }

      /* A link prints its text, an image prints its alt text */

      if (character === '[' || (character === '!' && value[index + 1] === '[')) {
        const link = Markdown.#link(value, character === '[' ? index : index + 1);

        if (link) {
          flush();
          nodes.push(...Markdown.#inline(link.text));
          index = link.end;
          continue;
        }
      }

      /* A delimiter that opens a styled run and finds its closer on this line */

      const run = Markdown.#delimiter(value, index);

      if (run) {
        const closer = Markdown.#closer(value, index, run);

        if (closer !== null) {
          flush();
          nodes.push({
            type: 'style',
            style: run.style,
            content: Markdown.#inline(value.slice(index + run.delimiter.length, closer)),
          });

          index = closer + run.delimiter.length;
          continue;
        }

        /* An unmatched delimiter is printed as written */

        text += run.delimiter;
        index += run.delimiter.length;
        continue;
      }

      text += character;
      index++;
    }

    flush();

    return nodes;
  }

  /**
     * The delimiter that opens a styled run at a position, if there is one. A
     * delimiter is a run of exactly one or two of its character, it is not
     * followed by whitespace, and the word delimiters, _ and __, only open
     * when the character before them is not part of a word.
     *
     * @param  {string}   value   One line of the source
     * @param  {number}   index   The position in the line
     * @return {object | null}    The delimiter, or null when none opens here
     */
  static #delimiter(value, index) {
    const length = Markdown.#run(value, index);

    if (length === 0 || length > 2) {
      return null;
    }

    const run = DELIMITERS.find((item) => item.delimiter === value[index].repeat(length));

    if (!run) {
      return null;
    }

    const next = value[index + length];

    if (typeof next === 'undefined' || WHITESPACE.test(next)) {
      return null;
    }

    if (run.boundary && index > 0 && ALPHANUMERIC.test(value[index - 1])) {
      return null;
    }

    return run;
  }

  /**
     * The position of the delimiter that closes a styled run, if it is on the
     * same line. A closer is a run of the same length, it is not preceded by
     * whitespace, and the word delimiters only close when the character after
     * them is not part of a word.
     *
     * @param  {string}   value   One line of the source
     * @param  {number}   index   The position of the opening delimiter
     * @param  {object}   run     The delimiter that opened the run
     * @return {number | null}    The position of the closing delimiter, or null when there is none
     */
  static #closer(value, index, run) {
    const length = run.delimiter.length;

    let position = index + length;

    while (position < value.length) {
      if (value[position] === '\\') {
        position += 2;
        continue;
      }

      if (value[position] !== value[index]) {
        position++;
        continue;
      }

      const found = Markdown.#run(value, position);

      if (found !== length) {
        position += found;
        continue;
      }

      const previous = value[position - 1];
      const next = value[position + length];

      if (!WHITESPACE.test(previous) && !(run.boundary && typeof next !== 'undefined' && ALPHANUMERIC.test(next))) {
        return position;
      }

      position += found;
    }

    return null;
  }

  /**
     * The length of the run of delimiter characters at a position
     *
     * @param  {string}   value   One line of the source
     * @param  {number}   index   The position in the line
     * @return {number}           The number of characters in the run, zero when there is none
     */
  static #run(value, index) {
    if (!'*_='.includes(value[index])) {
      return 0;
    }

    let length = 1;

    while (value[index + length] === value[index]) {
      length++;
    }

    return length;
  }

  /**
     * Parse a link or the alt text of an image at a position, which is a text
     * in square brackets followed by a target in parentheses
     *
     * @param  {string}   value   One line of the source
     * @param  {number}   index   The position of the opening bracket
     * @return {{text: string, end: number} | null}   The text of the link and the line after it
     */
  static #link(value, index) {
    let position = index + 1;
    let depth = 1;

    while (position < value.length && depth > 0) {
      if (value[position] === '\\') {
        position += 2;
        continue;
      }

      if (value[position] === '[') {
        depth++;
      }

      if (value[position] === ']') {
        depth--;

        if (depth === 0) {
          break;
        }
      }

      position++;
    }

    if (depth > 0 || value[position + 1] !== '(') {
      return null;
    }

    const text = value.slice(index + 1, position);

    position += 2;

    while (position < value.length) {
      if (value[position] === '\\') {
        position += 2;
        continue;
      }

      if (value[position] === ')') {
        return {text, end: position + 1};
      }

      position++;
    }

    return null;
  }
}

const codepageMappings = {
	'esc-pos': {
		'bixolon/legacy': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,,,,'cp858'],
		'bixolon': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,'windows1252','cp866','cp852','cp858',,'cp862','cp864','thai42','windows1253','windows1254','windows1257',,'windows1251','cp737','cp775','thai14','bixolon/hebrew','windows1255','thai11','thai18','cp855','cp857','iso8859-7','thai16','windows1256','windows1258','khmer',,,,'bixolon/cp866','windows1250',,'tcvn3','tcvn3capitals','viscii'],
		'citizen': ['cp437','epson/katakana','cp858','cp860','cp863','cp865','cp852','cp866','cp857',,,,,,,,'windows1252',,,,,'thai11',,,,,'thai13',,,,'tcvn3','tcvn3capitals','windows1258',,,,,,,,'cp864'],
		'epson/legacy': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,'windows1252','cp866','cp852','cp858'],
		'epson': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,'cp851','cp853','cp857','cp737','iso8859-7','windows1252','cp866','cp852','cp858','thai42','thai11',,,,,'thai13',,,,'tcvn3','tcvn3capitals','cp720','cp775','cp855','cp861','cp862','cp864','cp869','epson/iso8859-2','iso8859-15','cp1098','cp774','cp772','cp1125','windows1250','windows1251','windows1253','windows1254','windows1255','windows1256','windows1257','windows1258','rk1048'],
		'fujitsu': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,'cp857',,,,,,,,'windows1252','cp866','cp852','cp858',,,,,,,'thai13',,,,,,,,,,,,,,'cp864'],
		'hp': ['cp437','cp850','cp852','cp860','cp863','cp865','cp858','cp866','windows1252','cp862','cp737','cp874','cp857','windows1251','windows1255','rk1048'],
		'metapace': ['cp437','epson/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,,,,'cp858'],
		'mpt': ['cp437',,'cp850','cp860','cp863','cp865','windows1251','cp866','cp3021','cp3012'],
		'pos-5890': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','iso8859-1',,'cp862',,,,,,,,'windows1252','cp866','cp852','cp858',,,,'windows1251','cp737','windows1257',,'windows1258','cp864',,,,'windows1255',,,,,,,,,,,,,,,,,,,,,,,,'cp861',,,,'cp855','cp857',,,,'cp851','cp869',,'cp772','cp774',,,'windows1250',,'cp3840',,'cp3843','cp3844','cp3845','cp3846','cp3847','cp3848',,'cp771','cp3001','cp3002','cp3011','cp3012',,'cp3041','windows1253','windows1254','windows1256','cp720',,'cp775'],
		'pos-8360': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','iso8859-1','windows1253','cp862',,,,,,,,'windows1252','cp866','cp852','cp858',,'latvian',,'windows1251','cp737','windows1257',,'windows1258','cp864',,,'pos8360/hebrew','windows1255',,,,,,,,,,,,,,,,,,,,,,,,'cp861',,,,'cp855','cp857',,,,'cp851','cp869',,'cp772','cp774',,,'windows1250',,'cp3840',,'cp3843','cp3844','cp3845','cp3846','cp3847','cp3848',,'cp771','cp3001','cp3002','cp3011','cp3012',,,,'windows1254','windows1256','cp720',,'cp775'],
		'star': ['cp437','star/katakana','cp850','cp860','cp863','cp865',,,,,,,,,,,'windows1252','cp866','cp852','cp858','thai42','thai11','thai13','thai14','thai16',,'thai18'],
		'sunmi': ['cp437',,'cp850','cp860','cp863','cp865',,,,,,,,'cp857','cp737','iso8859-7','windows1252','cp866','cp852','cp858',,'cp874',,,,,,,,,,,,'cp775','cp855',,'cp862','cp864'],
		'xprinter': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','iso8859-1','windows1253','xprinter/hebrew','cp3012',,'windows1255',,,,,'windows1252','cp866','cp852','cp858',,'latvian','cp864','windows1251','cp737','windows1257',,,,,,,,'windows1256'],
		'youku': ['cp437','epson/katakana','cp850','cp860','cp863','cp865','windows1251','cp866','cp3021','cp3012',,,,,,'cp862','windows1252',,'cp852','cp858',,,'cp864','iso8859-1','cp737','windows1257',,,'cp855','cp857','windows1250','cp775','windows1254','windows1255','windows1256','windows1258',,,'iso8859-1',,,,,,'iso8859-15',,,'cp874'],
	},
	'star-prnt': {
		'star': ['star/standard','cp437','star/katakana',,'cp858','cp852','cp860','cp861','cp863','cp865','cp866','cp855','cp857','cp862','cp864','cp737','cp851','cp869','star/cp928','cp772','cp774','star/cp874',,,,,,,,,,,'windows1252','windows1250','windows1251',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,'cp3840','cp3841','cp3843','cp3844','cp3845','cp3846','cp3847','cp3848','cp1001','cp771','cp3001','cp3002','cp3011','cp3012','cp3021','cp3041'],
	}
};

codepageMappings['star-line'] = codepageMappings['star-prnt'];
codepageMappings['esc-pos']['zijang'] = codepageMappings['esc-pos']['pos-5890'];

const printerDefinitions = {
	'bixolon-srp350': {vendor:'Bixolon',model:'SRP-350',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'bixolon/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:4}}},
	'bixolon-srp350iii': {vendor:'Bixolon',model:'SRP-350III',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'bixolon',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56},C:{size:'9x24',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'citizen-ct-s310ii': {vendor:'Citizen',model:'CT-S310II',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'citizen',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64},C:{size:'8x16',columns:72}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3}}},
	'epson-tm-m30ii': {vendor:'Epson',model:'TM-m30II',interfaces:{usb:{productName:'TM-m30II'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'10x24',columns:57},C:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-m30iii': {vendor:'Epson',model:'TM-m30III',interfaces:{usb:{productName:'TM-m30III'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'10x24',columns:57},C:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-p20ii': {vendor:'Epson',model:'TM-P20II',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42},C:{size:'9x17',columns:42},D:{size:'10x24',columns:38},E:{size:'8x16',columns:48}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'epson-tm-t20ii': {vendor:'Epson',model:'TM-T20II',interfaces:{usb:{productName:'TM-T20II'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-t20iii': {vendor:'Epson',model:'TM-T20III',interfaces:{usb:{productName:'TM-T20III'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-t20iv': {vendor:'Epson',model:'TM-T20IV',interfaces:{usb:{productName:'TM-T20IV'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-t70': {vendor:'Epson',model:'TM-T70',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},images:{mode:'raster'},cutter:{feed:4}}},
	'epson-tm-t70ii': {vendor:'Epson',model:'TM-T70II','interface':{usb:{productName:'TM-T70II'}},media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},images:{mode:'raster'},cutter:{feed:4}}},
	'epson-tm-t88ii': {vendor:'Epson',model:'TM-T88II',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:4}}},
	'epson-tm-t88iii': {vendor:'Epson',model:'TM-T88III',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:4}}},
	'epson-tm-t88iv': {vendor:'Epson',model:'TM-T88IV',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson/legacy',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-t88v': {vendor:'Epson',model:'TM-T88V',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-t88vi': {vendor:'Epson',model:'TM-T88VI',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'epson-tm-t88vii': {vendor:'Epson',model:'TM-T88VII',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:4}}},
	'fujitsu-fp1000': {vendor:'Fujitsu',model:'FP-1000',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'fujitsu',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:56},C:{size:'8x16',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:false},cutter:{feed:4}}},
	'hp-a779': {vendor:'HP',model:'A779',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'hp',newline:'\n',fonts:{A:{size:'12x24',columns:44}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:false,fallback:{type:'barcode',symbology:75}},cutter:{feed:4}}},
	'meow': {vendor:'Meow',model:'Cat printer',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'epson',fonts:{A:{size:'12x24',columns:32},B:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','code128-auto']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'metapace-t1': {vendor:'Metapace',model:'T-1',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'metapace',fonts:{A:{size:'12x24',columns:42},B:{size:'9x17',columns:56}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:4}}},
	'mpt-ii': {vendor:'',model:'MPT-II',media:{dpi:180,width:80},capabilities:{language:'esc-pos',codepages:'mpt',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64},C:{size:'0x0',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:[]},pdf417:{supported:false}}},
	'pos-5890': {vendor:'',model:'POS-5890',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'pos-5890',fonts:{A:{size:'12x24',columns:32},B:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'pos-8360': {vendor:'',model:'POS-8360',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'pos-8360',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster'},cutter:{feed:4}}},
	'star-mc-print2': {vendor:'Star',model:'mC-Print2',interfaces:{usb:{productName:'mC-Print2'}},media:{dpi:203,width:58},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3}}},
	'star-mpop': {vendor:'Star',model:'mPOP',interfaces:{usb:{productName:'mPOP'}},media:{dpi:203,width:58},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3}}},
	'star-sm-l200': {vendor:'Star',model:'SM-L200',media:{dpi:203,width:58},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42},C:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true}}},
	'star-tsp100iii': {vendor:'Star',model:'TSP100III',media:{dpi:203,width:80},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3}}},
	'star-tsp100iv': {vendor:'Star',model:'TSP100IV',media:{dpi:203,width:80},capabilities:{language:'star-prnt',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3}}},
	'star-tsp650': {vendor:'Star',model:'TSP650',media:{dpi:203,width:80},capabilities:{language:'star-line',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:false,models:[]},pdf417:{supported:false},cutter:{feed:3}}},
	'star-tsp650ii': {vendor:'Star',model:'TSP650II',media:{dpi:203,width:80},capabilities:{language:'star-line',codepages:'star',fonts:{A:{size:'12x24',columns:48},B:{size:'9x24',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128','gs1-databar-omni','gs1-databar-truncated','gs1-databar-limited','gs1-databar-expanded']},qrcode:{supported:true,models:['1','2']},pdf417:{supported:true},cutter:{feed:3}}},
	'sunmi-p2se': {vendor:'SUNMI',model:'P2SE',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'sunmi',fonts:{A:{size:'12x24',columns:32},B:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'sunmi-p3h': {vendor:'SUNMI',model:'P3H',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'sunmi',fonts:{A:{size:'12x24',columns:32},B:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'sunmi-p3kh': {vendor:'SUNMI',model:'P3KH',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'sunmi',fonts:{A:{size:'12x24',columns:32},B:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'sunmi-p3mix': {vendor:'SUNMI',model:'P3 MIX',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'sunmi',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'sunmi': {vendor:'SUNMI',model:'Generic',media:{dpi:203},capabilities:{language:'esc-pos',codepages:'sunmi',fonts:{A:{size:'12x24',columns:32},B:{size:'9x17',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},images:{mode:'raster'}}},
	'xprinter-xp-n160ii': {vendor:'Xprinter',model:'XP-N160II',interfaces:{usb:{productName:'Printer-80\u0000'}},media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'xprinter',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},cutter:{feed:4}}},
	'xprinter-xp-t80q': {vendor:'Xprinter',model:'XP-T80Q',media:{dpi:203,width:80},capabilities:{language:'esc-pos',codepages:'xprinter',fonts:{A:{size:'12x24',columns:48},B:{size:'9x17',columns:64}},barcodes:{supported:true,symbologies:['upca','upce','ean13','ean8','code39','itf','codabar','code93','code128','gs1-128']},qrcode:{supported:true,models:['2']},pdf417:{supported:true},cutter:{feed:4}}},
	'youku-58t': {vendor:'Youku',model:'58T',media:{dpi:203,width:58},capabilities:{language:'esc-pos',codepages:'youku',fonts:{A:{size:'12x24',columns:32},B:{size:'9x24',columns:42}},barcodes:{supported:true,symbologies:['upca','ean13','ean8','code39','itf','codabar','code93','code128']},qrcode:{supported:true,models:['2']},pdf417:{supported:false}}},
};

/* Type definitions */

/** @import { PrinterModel, CodepageMappingName } from '../generated/types.js' */
/** @import { Codepage } from '@point-of-sale/codepage-encoder' */

/** @typedef {'esc-pos' | 'star-prnt' | 'star-line'} Language */
/** @typedef {'left' | 'center' | 'right'} Alignment */
/** @typedef {'threshold' | 'bayer' | 'floydsteinberg' | 'atkinson'} DitherAlgorithm */
/** @typedef {'relaxed' | 'strict'} ErrorLevel */
/** @typedef {'small' | 'normal'} TextSize */
/** @typedef {'full' | 'partial'} CutType */
/** @typedef {'default' | 'none'} LineSpacing */
/** @typedef {'upca' | 'upce' | 'ean13' | 'ean8' | 'code39' | 'itf' | 'codabar' | 'code93' | 'code128' | 'code128-auto' | 'gs1-128' | 'gs1-databar-omni' | 'gs1-databar-truncated' | 'gs1-databar-limited' | 'gs1-databar-expanded'} BarcodeSymbology */

/**
 * @typedef {Object} ReceiptPrinterEncoderOptions
 * @property {number} [columns]
 * @property {Language} [language]
 * @property {'column' | 'raster'} [imageMode]
 * @property {number} [feedBeforeCut]
 * @property {boolean} [feedAfterBlock]
 * @property {'\n\r' | '\n'} [newline]
 * @property {CodepageMappingName | Record<string, number>} [codepageMapping]
 * @property {Codepage[]} [codepageCandidates]
 * @property {ErrorLevel} [errors]
 * @property {PrinterModel} [printerModel]
 * @property {boolean} [debug]
 * @property {boolean} [embedded]
 * @property {((width: number, height: number) => HTMLCanvasElement) | null} [createCanvas]
 * @property {ReceiptLineModule | null} [receiptline]
 * @property {number} [width]
 * @property {boolean} [autoFlush]
 */

/**
 * Print a receiptline document onto an encoder, the transform function of
 * @point-of-sale/receiptline
 *
 * @callback ReceiptLineTransform
 * @param {ReceiptPrinterEncoder} encoder   The encoder to print on
 * @param {string} document                 The receiptline document
 * @param {object} [options]                The options of the module
 * @return {Promise<ReceiptPrinterEncoder>}
 */

/**
 * The module that prints receiptline documents, @point-of-sale/receiptline,
 * given to the encoder through the receiptline option
 *
 * @typedef {Object} ReceiptLineModule
 * @property {ReceiptLineTransform} transform
 */

/**
 * @typedef {Object} TableColumn
 * @property {number | 'auto'} [width]
 * @property {Alignment} [align]
 * @property {'top' | 'bottom'} [verticalAlign]
 * @property {'wrap' | 'clip' | 'ellipsis'} [overflow]
 * @property {number} [marginLeft]
 * @property {number} [marginRight]
 */

/**
 * @typedef {Object} RuleOptions
 * @property {'single' | 'double'} [style]
 * @property {number} [width]
 */

/**
 * @typedef {Object} BoxOptions
 * @property {'single' | 'double' | 'none'} [outline]
 * @property {'square' | 'rounded'} [corners]
 * @property {'single' | 'double' | 'none'} [style]   Deprecated alias for outline
 * @property {number} [width]
 * @property {Alignment} [align]
 * @property {number} [marginLeft]
 * @property {number} [marginRight]
 * @property {number} [paddingLeft]
 * @property {number} [paddingRight]
 */

/**
 * @typedef {'none'|'above'|'below'|'both'} BarcodeText
 */

/**
 * @typedef {Object} BarcodeOptions
 * @property {number} [height]
 * @property {number} [width]
 * @property {BarcodeText|boolean} [text]  Where the human readable text goes, `true` is `below` and `false` is `none`
 */

/**
 * @typedef {Object} QRCodeOptions
 * @property {1 | 2} [model]
 * @property {number} [size]
 * @property {'l' | 'm' | 'q' | 'h'} [errorlevel]
 */

/**
 * @typedef {Object} PDF417Options
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [columns]
 * @property {number} [rows]
 * @property {number} [errorlevel]
 * @property {boolean} [truncated]
 */

/**
 * @typedef {Object} ImageOptions
 * @property {number} [width]      Width of the image on the paper in dots
 * @property {number} [height]     Height of the image on the paper in dots
 * @property {DitherAlgorithm} [algorithm]
 * @property {number} [threshold]
 * @property {'column' | 'raster'} [mode]  The ESC/POS image command for this image, instead of imageMode
 */

/** @typedef {Object} SharpInput */
/** @typedef {Object} NdarrayInput */
/** @typedef {Object} ReadImageInput */
/** @typedef {ImageData|HTMLImageElement|HTMLCanvasElement|SharpInput|NdarrayInput|ReadImageInput} ImageInput */

/**
 * @typedef {Object} PrinterModelInfo
 * @property {string} id
 * @property {string} name
 */

/** @typedef {string | ((encoder: ReceiptPrinterEncoder) => void)} TableCellContent */

/**
 * @typedef {Object} TableCellBorder
 * @property {'none' | 'single' | 'double'} [top]
 * @property {'none' | 'single' | 'double'} [right]
 * @property {'none' | 'single' | 'double'} [bottom]
 * @property {'none' | 'single' | 'double'} [left]
 */

/**
 * @typedef {Object} TableOutline
 * @property {'none' | 'single' | 'double'} [top]
 * @property {'none' | 'single' | 'double'} [right]
 * @property {'none' | 'single' | 'double'} [bottom]
 * @property {'none' | 'single' | 'double'} [left]
 */

/**
 * @typedef {Object} TableCellObject
 * @property {number} [span]
 * @property {TableCellContent} [content]
 * @property {Alignment} [align]
 * @property {'none' | 'single' | 'double' | TableCellBorder} [border]
 * @property {number} [marginLeft]
 * @property {number} [marginRight]
 */

/** @typedef {TableCellContent | TableCellObject} TableCell */

/** @typedef {{ rule: true }} TableRule */

/** @typedef {TableCell[] | TableRule} TableRow */

/**
 * @typedef {Object} TableOptions
 * @property {'none' | 'single' | 'double'} [border]
 * @property {'square' | 'rounded'} [corners]
 * @property {'none' | 'all'} [rules]
 * @property {'none' | 'single' | 'double' | TableOutline} [outline]
 * @property {number} [width]
 */
/** @typedef {string | ((encoder: ReceiptPrinterEncoder) => void)} BoxContent */


/**
 * Create a byte stream based on commands for receipt printers
 */
class ReceiptPrinterEncoder {
  #options = {};
  #queue = [];

  #language;
  #composer;

  #printerResolution = null;

  #printerCapabilities = {
    'fonts': {
      'A': {size: '12x24', columns: 42},
      'B': {size: '9x24', columns: 56},
    },
    'barcodes': {
      'supported': true,
      'symbologies': [
        'upca', 'upce', 'ean13', 'ean8', 'code39', 'itf', 'codabar', 'code93',
        'code128', 'gs1-128', 'gs1-databar-omni', 'gs1-databar-truncated',
        'gs1-databar-limited', 'gs1-databar-expanded',
      ],
    },
    'qrcode': {
      'supported': true,
      'models': ['1', '2'],
    },
    'pdf417': {
      'supported': true,
    },
  };

  #codepageMapping = {};
  #codepageCandidates = [];
  #codepage = 'cp437';
  #border = null;
  #tight = false;

  #state = {
    'codepage': -1,
    'font': 'A',
    'lineSpacing': 'default',
  };


  /**
     * Create a new object
     *
     * @param  {ReceiptPrinterEncoderOptions}   [options]   Object containing configuration options
    */
  constructor(options) {
    options = options || {};

    const defaults = {
      columns: 42,
      language: 'esc-pos',
      imageMode: 'column',
      feedBeforeCut: 0,
      feedAfterBlock: true,
      newline: '\n\r',
      codepageMapping: 'epson',
      codepageCandidates: null,
      errors: 'relaxed',
    };

    /* Determine default settings based on the printer language */

    if (typeof options.language === 'string') {
      defaults.columns = options.language === 'esc-pos' ? 42 : 48;
      defaults.codepageMapping = options.language === 'esc-pos' ? 'epson' : 'star';
    }

    /* Determine default settings based on the printer model */

    if (typeof options.printerModel === 'string') {
      if (typeof printerDefinitions[options.printerModel] === 'undefined') {
        throw new Error('Unknown printer model');
      }

      this.#printerCapabilities = printerDefinitions[options.printerModel].capabilities;
      this.#printerResolution = printerDefinitions[options.printerModel].media?.dpi || null;

      /* Apply the printer definition to the defaults */

      defaults.columns = this.#printerCapabilities.fonts['A'].columns;
      defaults.language = this.#printerCapabilities.language;
      defaults.codepageMapping = this.#printerCapabilities.codepages;
      defaults.newline = this.#printerCapabilities?.newline || defaults.newline;
      defaults.feedBeforeCut = this.#printerCapabilities?.cutter?.feed || defaults.feedBeforeCut;
      defaults.imageMode = this.#printerCapabilities?.images?.mode || defaults.imageMode;
    }

    /* Merge options */

    if (options) {
      this.#options = Object.assign(defaults, {
        debug: false,
        embedded: false,
        createCanvas: null,
        receiptline: null,
      }, options);
    }

    /* Backwards compatibility for the width option */

    if (this.#options.width) {
      this.#options.columns = this.#options.width;
    }

    /* Get the printer language */

    if (this.#options.language === 'esc-pos') {
      this.#language = new LanguageEscPos();
    } else if (this.#options.language === 'star-prnt' || this.#options.language === 'star-line') {
      this.#language = new LanguageStarPrnt();
    } else {
      throw new Error('The specified language is not supported');
    }

    /* Determine autoflush settings */
    /*

        StarPRNT printers are set up to have print start control set to page units.
        That means the printer will only print after it has received a cut or ff command.
        This is not ideal, so we set autoFlush to true by default, which will force
        the printer to print after each encode().

        One problem, we do not want to do this for embedded content. Only the top level
        encoder should flush the buffer.

        ESC/POS and Star Line Mode printers are set up to have print start control set to
        line units, which means the printer will print after each line feed command.
        We do not need to flush the buffer for these printers.

    */

    if (typeof this.#options.autoFlush === 'undefined') {
      this.#options.autoFlush = ! this.#options.embedded && this.#options.language == 'star-prnt';
    }

    /* Check column width */

    if (![32, 35, 42, 44, 48].includes(this.#options.columns) && !this.#options.embedded) {
      throw new Error('The width of the paper must me either 32, 35, 42, 44 or 48 columns');
    }

    /* Determine codepage mapping and candidates */

    if (typeof this.#options.codepageMapping === 'string') {
      if (typeof codepageMappings[this.#options.language][this.#options.codepageMapping] === 'undefined') {
        throw new Error('Unknown codepage mapping');
      }

      this.#codepageMapping = Object.fromEntries(codepageMappings[this.#options.language][this.#options.codepageMapping]
          .map((v, i) => [v, i])
          .filter((i) => i));
    } else {
      this.#codepageMapping = this.#options.codepageMapping;
    }

    if (this.#options.codepageCandidates) {
      this.#codepageCandidates = this.#options.codepageCandidates;
    } else {
      this.#codepageCandidates = Object.keys(this.#codepageMapping);
    }

    /* Set the default codepage for the printer language */

    this.#codepage = this.#defaultCodepage();

    /* Create our line composer */

    this.#createComposer();

    this.#reset();
  }

  /**
     * Create a fresh line composer, with default styles, alignment and columns
     */
  #createComposer() {
    this.#composer = new LineComposer({
      embedded: this.#options.embedded,
      columns: this.#options.columns,
      align: 'left',
      size: 1,
      style: this.#options.style,
      overflow: this.#options.overflow,

      callback: (value) => this.#queue.push(value),
    });
  }

  /**
     * The code page the encoder starts with: the default of the printer
     * language when the printer has it, otherwise the first page of its
     * code page mapping
     *
     * @return {Codepage}   The name of the code page
     */
  #defaultCodepage() {
    const codepage = this.#options.language == 'esc-pos' ? 'cp437' : 'star/standard';

    if (typeof this.#codepageMapping[codepage] !== 'undefined') {
      return codepage;
    }

    return Object.keys(this.#codepageMapping)[0] || codepage;
  }

  /**
     * Get the glyphs and code pages the borders of boxes and tables are drawn
     * with. Looking them up means encoding a handful of glyphs in every code
     * page of the printer, so it is done once, when the first border is drawn.
     * Table cells and boxes take the borders of the encoder they are embedded
     * in, which is why they get an accessor rather than the object itself
     *
     * @return {Border}   The borders of this encoder
     */
  #borders() {
    if (this.#border === null) {
      this.#border = this.#options.embedded && typeof this.#options.borders === 'function' ?
        this.#options.borders() :
        new Border(this.#codepageMapping);
    }

    return this.#border;
  }

  /**
     * Reset the output queue, but keep the state of the encoder, such as the
     * code page and text styles, for the next chunk of the receipt
     */
  #reset() {
    this.#queue = [];
  }

  /**
     * Initialize the printer
     *
     * @return {ReceiptPrinterEncoder}          Return the object, for easy chaining commands
     *
     */
  initialize() {
    if (this.#options.embedded) {
      throw new Error('Initialize is not supported in table cells or boxes');
    }

    /* The initialize command resets both the printer and the encoder to a clean
       slate: no code page, no styles, default font and alignment. It marks the
       start of a receipt, so it is only allowed as the first command, or right
       after an encode(). If there is anything left in the buffer, it throws */

    if (this.#queue.length > 0 || !this.#composer.empty) {
      throw new Error('Initialize must be the first command, or come right after an encode()');
    }

    /* Reset the state of the encoder */

    this.#codepage = this.#defaultCodepage();
    this.#state.codepage = -1;
    this.#state.font = 'A';
    this.#state.lineSpacing = 'default';

    this.#createComposer();

    /* Reset the printer */

    this.#composer.add(
        this.#language.initialize(),
    );

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    return this;
  }

  /**
     * Change the code page
     *
     * @param  {Codepage | 'auto'}   codepage  The codepage that we set the printer to
     * @return {ReceiptPrinterEncoder}             Return the object, for easy chaining commands
     *
     */
  codepage(codepage) {
    if (codepage === 'auto') {
      this.#codepage = codepage;
      return this;
    }

    if (!CodepageEncoder.supports(codepage)) {
      throw new Error('Unknown codepage');
    }

    if (typeof this.#codepageMapping[codepage] !== 'undefined') {
      this.#codepage = codepage;
    } else {
      throw new Error('Codepage not supported by printer');
    }

    return this;
  }

  /**
     * Print text
     *
     * @param  {string}   value  Text that needs to be printed
     * @return {ReceiptPrinterEncoder}          Return the object, for easy chaining commands
     *
     */
  text(value) {
    this.#composer.text(value, this.#codepage);

    return this;
  }

  /**
     * Print a newline
     *
     * @param  {number}   [value]  The number of newlines that need to be printed, defaults to 1
     * @return {ReceiptPrinterEncoder}          Return the object, for easy chaining commands
     *
     */
  newline(value) {
    value = parseInt(value, 10) || 1;

    for (let i = 0; i < value; i++) {
      this.#composer.flush({forceNewline: true});
    }

    return this;
  }

  /**
     * Print text, followed by a newline
     *
     * @param  {string}   value  Text that needs to be printed
     * @return {ReceiptPrinterEncoder}          Return the object, for easy chaining commands
     *
     */
  line(value) {
    this.text(value);
    this.newline();

    return this;
  }

  /**
     * Underline text
     *
     * @param  {boolean}          [value]  true to turn on underline, false to turn off
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  underline(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.underline = ! this.#composer.style.underline;
    } else {
      this.#composer.style.underline = value;
    }

    return this;
  }

  /**
     * Italic text
     *
     * @param  {boolean}          [value]  true to turn on italic, false to turn off
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  italic(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.italic = ! this.#composer.style.italic;
    } else {
      this.#composer.style.italic = value;
    }

    return this;
  }

  /**
     * Bold text
     *
     * @param  {boolean}          [value]  true to turn on bold, false to turn off
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  bold(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.bold = ! this.#composer.style.bold;
    } else {
      this.#composer.style.bold = value;
    }

    return this;
  }

  /**
     * Invert text
     *
     * @param  {boolean}          [value]  true to turn on white text on black, false to turn off
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  invert(value) {
    if (typeof value === 'undefined') {
      this.#composer.style.invert = ! this.#composer.style.invert;
    } else {
      this.#composer.style.invert = value;
    }

    return this;
  }

  /**
     * Change width of text
     *
     * @param  {number}          [width]    The width of the text, 1 - 8
     * @return {ReceiptPrinterEncoder}                   Return the object, for easy chaining commands
     *
     */
  width(width) {
    if (typeof width === 'undefined') {
      width = 1;
    }

    if (typeof width !== 'number') {
      throw new Error('Width must be a number');
    }

    if (width < 1 || width > 8) {
      throw new Error('Width must be between 1 and 8');
    }

    this.#composer.style.width = width;

    return this;
  }

  /**
     * Change height of text
     *
     * @param  {number}          [height]  The height of the text, 1 - 8
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  height(height) {
    if (typeof height === 'undefined') {
      height = 1;
    }

    if (typeof height !== 'number') {
      throw new Error('Height must be a number');
    }

    if (height < 1 || height > 8) {
      throw new Error('Height must be between 1 and 8');
    }

    this.#composer.style.height = height;

    return this;
  }

  // eslint-disable-next-line valid-jsdoc
  /**
     * Change text size
     *
     * @overload
     * @param {number} width   The width of the text, 1 - 8
     * @param {number} [height]  The height of the text, 1 - 8
     * @return {ReceiptPrinterEncoder}
     */
  // eslint-disable-next-line valid-jsdoc
  /**
     * @overload
     * @param {TextSize} value  The text size preset
     * @return {ReceiptPrinterEncoder}
     */
  /**
     * @param {number|TextSize} width
     * @param {number} [height]
     * @return {ReceiptPrinterEncoder}
     */
  size(width, height) {
    /* Backwards compatiblity for changing the font */
    if (typeof width === 'string') {
      return this.font(width === 'small' ? 'B' : 'A');
    }

    if (typeof height === 'undefined') {
      height = width;
    }

    this.width(width);
    this.height(height);

    return this;
  }

  /**
     * Choose different font
     *
     * @param  {string}          value   'A', 'B' or others
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  font(value) {
    if (this.#options.embedded) {
      throw new Error('Changing fonts is not supported in table cells or boxes');
    }

    if (this.#composer.cursor > 0) {
      throw new Error('Changing fonts is not supported in the middle of a line');
    }

    /* If size is specified, find the matching font */

    const matches = value.match(/^[0-9]+x[0-9]+$/);
    if (matches) {
      const font = Object.entries(this.#printerCapabilities.fonts).find((i) => i[1].size == matches[0]);

      if (font) {
        value = font[0];
      }
    }

    /* Make sure the font name is uppercase */

    value = value.toUpperCase();

    /* Check if the font is supported */

    if (typeof this.#printerCapabilities.fonts[value] === 'undefined') {
      return this.#error('This font is not supported by this printer', 'relaxed');
    }

    /* Change the font */

    this.#composer.add(
        this.#language.font(value),
    );

    this.#state.font = value;

    /* Change the width of the composer */

    if (value === 'A') {
      this.#composer.columns = this.#options.columns;
    } else {
      this.#composer.columns =
        (this.#options.columns / this.#printerCapabilities.fonts['A'].columns) *
        this.#printerCapabilities.fonts[value].columns;
    }

    return this;
  }

  /**
     * Change text alignment
     *
     * @param  {Alignment}          value   left, center or right
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  align(value) {
    const alignments = ['left', 'center', 'right'];

    if (!alignments.includes(value)) {
      throw new Error('Unknown alignment');
    }

    this.#composer.align = value;

    return this;
  }

  /**
     * Change the line spacing
     *
     * @param  {LineSpacing}          value   default or none
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  lineSpacing(value) {
    if (this.#options.embedded) {
      throw new Error('Changing the line spacing is not supported in table cells or boxes');
    }

    const values = ['default', 'none'];

    if (!values.includes(value)) {
      throw new Error('Unknown line spacing');
    }

    this.#setLineSpacing(value);

    return this;
  }

  /**
     * Change the line spacing, without validating the value. Used by the
     * command and by the borders of boxes and tables, which are printed
     * without line spacing so that their vertical lines touch. In an embedded
     * encoder it only records that its lines have to be printed that way
     *
     * @param  {LineSpacing}   value   The line spacing, default or none
     */
  #setLineSpacing(value) {
    /* The lines of a table cell or a box are interleaved with the lines of the
       cells next to them, so an embedded encoder cannot change the line
       spacing itself. It records the request and the encoder it is embedded
       in, which knows where its lines start and end, wraps them */

    if (this.#options.embedded) {
      if (value === 'none') {
        this.#tight = true;
      }

      return;
    }

    if (value === this.#state.lineSpacing) {
      return;
    }

    this.#composer.add(
        this.#language.lineSpacing(value),
    );

    this.#state.lineSpacing = value;
  }

  // eslint-disable-next-line valid-jsdoc
  /**
     * Insert a table
     *
     * @param  {TableColumn[]}     columns    The column definitions
     * @param  {TableRow[]}        data       Array containing rows. A row is either an array
     *                                        containing cells, or an object with a rule property
     *                                        set to true, which prints a horizontal rule between
     *                                        two rows. A cell is a string value, a callback
     *                                        function, or an object with a content, span, align,
     *                                        border, marginLeft and marginRight property, which lets
     *                                        the cell span multiple columns, turn its own border off,
     *                                        either entirely with none, or per side with an object
     *                                        with any of top, right, bottom and left set to none, and
     *                                        override the margins of the column.
     *                                        The first parameter of the callback is the encoder
     *                                        object on which the function can call its methods.
     * @param  {TableOptions}      [options]  An object with the following properties:
     *                                        - outline: The style of the frame around the table, either none,
     *                                          single or double, or an object with any of top, right, bottom
     *                                          and left set to one of those, the sides that are left out
     *                                          being none
     *                                        - border: The style of the lines between the cells, the vertical
     *                                          dividers and the rule rows, either none, single or double
     *                                        - corners: The style of the corners of a single outline, either
     *                                          square or rounded
     *                                        - rules: A rule between every pair of rows, either none or all
     *                                        - width: The width of the table, by default the width of the paper
     * @return {ReceiptPrinterEncoder}                   Return the object, for easy chaining commands
     *
     */
  table(columns, data, options) {
    options = Object.assign({
      border: 'none',
      corners: 'square',
      rules: 'none',
    }, options || {});

    if (!['none', 'single', 'double'].includes(options.border)) {
      throw new Error('Unknown border style');
    }

    if (!['square', 'rounded'].includes(options.corners)) {
      throw new Error('Unknown corners');
    }

    if (!['none', 'all'].includes(options.rules)) {
      throw new Error('Unknown rules');
    }

    if (typeof options.width !== 'undefined') {
      if (!Number.isInteger(options.width) || options.width < 1) {
        throw new Error('Table width must be a positive integer');
      }

      if (options.width * this.#composer.style.width > this.#composer.columns) {
        throw new Error('Table is too wide');
      }
    }

    /* The frame around the table and the lines between its cells are two
       independent styles: the outline is the style of every side of the frame,
       the border the style of the vertical dividers and of the rule rows */

    const outline = ReceiptPrinterEncoder.#resolveOutline(options);

    /* A divider between two cells has a column of its own when the table has a
       border, an outer rule when that side of the outline is drawn */

    const inner = options.border !== 'none';
    const bordered = inner || Object.values(outline).some((style) => style !== 'none');
    const layout = {inner, bordered, outline, styles: ReceiptPrinterEncoder.#tableStyles(options, outline)};

    columns = this.#resolveColumns(columns, options.width, inner, outline);

    /* The width of the table in characters of the current size: the columns,
       their margins, one character for every vertical divider between two
       cells and one for the left and for the right side of the outline where
       those are drawn */

    const width = columns.reduce(
        (total, column) => total + column.width + (column.marginLeft || 0) + (column.marginRight || 0),
        (inner ? columns.length - 1 : 0) +
          (outline.left !== 'none' ? 1 : 0) + (outline.right !== 'none' ? 1 : 0),
    );

    /* The cells of every row with their spans applied, and null for a rule row */

    const rows = this.#resolveRows(columns, data, options, layout);

    /* The style of every side of every cell: the outline at the edges of the
       table, the border between the cells, and none where a cell turned its
       own side off */

    if (bordered) {
      ReceiptPrinterEncoder.#applyStyles(rows, outline, options.border);
    }

    /* The glyphs of the border, per combination of the style of the horizontal
       and of the vertical line that meet in a junction, looked up once */

    const cache = new Map();

    /* A corner is rounded only when both of the sides that meet in it are
       single, so the option has no effect on a table without such a corner */

    const corners = options.corners === 'rounded' &&
      [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']]
          .some(([across, down]) => outline[across] === 'single' && outline[down] === 'single') ?
      'rounded' :
      'square';

    const glyphs = (horizontal, vertical) => {
      const key = `${horizontal}/${vertical}`;

      if (!cache.has(key)) {
        cache.set(key, this.#borders().glyphs(horizontal, vertical, corners));
      }

      return cache.get(key);
    };

    this.#composer.flush();

    if (rows.length === 0) {
      return this;
    }

    /* A bordered table is printed without line spacing from its top border to
       its bottom border, so that its vertical rules touch. A request that comes
       from the contents of a cell wraps the row that cell is in */

    const previous = this.#state.lineSpacing;

    /* The bottom border of the table, which is blank when no cell of the last
       row wants its bottom side. It is worked out before the rows are printed,
       because a table without a bottom border has no line of its own to restore
       the line spacing on, so the last line it prints does that instead */

    const last = rows[rows.length - 1];

    /* A rule row is drawn in the style of the border, and with single lines
       when the table has no dividers between its cells */

    const rule = options.border === 'none' ? 'single' : options.border;

    const bottom = bordered ? ReceiptPrinterEncoder.#tableShapes(width,
        ReceiptPrinterEncoder.#tableRules(last ?? [], layout), new Map(),
        ReceiptPrinterEncoder.#tableSegments(last ?? [], [], layout, width), outline.bottom) : null;

    /* The shape of the line of a rule row, which follows from the rows around
       it. A neighbour that is not there simply has no vertical rules */

    const shapes = (r) => ReceiptPrinterEncoder.#tableShapes(width,
        ReceiptPrinterEncoder.#tableRules(rows[r - 1] ?? [], layout),
        ReceiptPrinterEncoder.#tableRules(rows[r + 1] ?? [], layout),
        ReceiptPrinterEncoder.#tableSegments(rows[r - 1] ?? [], rows[r + 1] ?? [], layout, width), rule);

    /* A table whose bottom border is blank restores the line spacing on the
       last line it prints itself, which is its last row, or a rule row below
       that row when the outline leaves the bottom out and the rule is drawn */

    let restore = -1;

    if (bordered && bottom === null) {
      for (let r = rows.length - 1; r >= 0; r--) {
        if (rows[r] !== null || shapes(r) !== null) {
          restore = r;
          break;
        }
      }
    }

    if (bordered) {
      this.#setLineSpacing('none');

      this.#tableBorder(glyphs, ReceiptPrinterEncoder.#tableShapes(width,
          new Map(), ReceiptPrinterEncoder.#tableRules(rows[0] ?? [], layout),
          ReceiptPrinterEncoder.#tableSegments([], rows[0] ?? [], layout, width), outline.top));

      this.#composer.flush();
    }

    for (let r = 0; r < rows.length; r++) {
      if (rows[r] !== null) {
        this.#tableRow(rows[r], glyphs, layout, previous, r === restore);

        continue;
      }

      /* A rule row of a table without any lines is a horizontal line over the
         whole width of the table */

      if (!bordered) {
        const element = glyphs(rule, rule).horizontal;

        this.#composer.text(element.glyph.repeat(width), element.codepage);
        this.#composer.flush();

        continue;
      }

      this.#tableBorder(glyphs, shapes(r));

      /* A rule row at the end of a table without a bottom border is the last
         line the table prints, so it restores the line spacing */

      if (r === restore) {
        this.#setLineSpacing(previous);
      }

      this.#composer.flush();
    }

    if (bordered) {
      this.#tableBorder(glyphs, bottom);

      /* Restore the line spacing before the line feed of the bottom border,
         so that the paper is fed as usual after the table */

      if (bottom !== null) {
        this.#setLineSpacing(previous);
      }

      this.#composer.flush();
    }

    return this;
  }

  /**
     * Resolve the rows of a table: the cells of every row with their spans
     * applied, and null for every rule row. With rules set to all a rule row
     * is inserted between every pair of rows. A rule row that would double up
     * with a line that is already there is dropped: directly after another
     * rule row, directly after the top border when the top side of the outline
     * is drawn, and directly before the bottom border when the bottom side is.
     * Without those sides there is no line it doubles up with, so a rule row
     * above the first row or below the last one is kept and drawn.
     *
     * @param  {TableColumn[]}   columns    The column definitions, with numeric widths
     * @param  {TableRow[]}      data       The rows of the table
     * @param  {TableOptions}    options    The options of the table
     * @param  {object}          layout     The styles and the rule columns of the table
     * @return {Array}                      The rows, null for a rule row
     */
  #resolveRows(columns, data, options, layout) {
    const rows = [];

    for (let r = 0; r < data.length; r++) {
      let cells = null;

      if (Array.isArray(data[r])) {
        cells = this.#resolveCells(columns, data[r], r, layout);
      } else if (typeof data[r] !== 'object' || data[r] === null || data[r].rule !== true) {
        throw new Error('A row must be an array of cells, or an object with rule set to true');
      }

      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;

      /* A rule between every pair of rows */

      if (cells !== null && options.rules === 'all' && rows.length > 0 && last !== null) {
        rows.push(null);
      }

      if (cells === null && (last === null || (layout.outline.top !== 'none' && rows.length === 0))) {
        continue;
      }

      rows.push(cells);
    }

    /* A rule row at the end of a table doubles up with its bottom border */

    while (layout.outline.bottom !== 'none' && rows.length > 0 && rows[rows.length - 1] === null) {
      rows.pop();
    }

    /* A rule row has no cells of its own, so a table that draws its lines from
       the cells has nothing to draw when every one of its rows is a rule row */

    if (layout.bordered && rows.every((cells) => cells === null)) {
      return [];
    }

    return rows;
  }

  /**
     * Resolve the cells of one row of a table. A cell that spans columns is as
     * wide as the columns it covers, plus the margins between those columns,
     * plus one character for every vertical rule it swallows when the table
     * has a border. A row without a spanned cell has one cell per column, a
     * missing cell is empty.
     *
     * @param  {TableColumn[]}   columns    The column definitions, with numeric widths
     * @param  {TableCell[]}     row        The cells of the row
     * @param  {number}          index      The position of the row in the data
     * @param  {object}          layout     The styles and the rule columns of the table
     * @return {object[]}                   The cells of the row, with their widths and margins
     */
  #resolveCells(columns, row, index, layout) {
    if (!row.some(ReceiptPrinterEncoder.#isCellObject)) {
      return columns.map((column, c) =>
        ReceiptPrinterEncoder.#resolveCell([column], row[c], layout, index));
    }

    const cells = [];
    let position = 0;

    for (const cell of row) {
      const object = ReceiptPrinterEncoder.#isCellObject(cell);
      const span = object && typeof cell.span !== 'undefined' ? cell.span : 1;

      if (!Number.isInteger(span) || span < 1) {
        throw new Error('The span of a cell must be a positive integer');
      }

      if (position + span > columns.length) {
        throw new Error(`The spans of row ${index + 1} do not add up to the number of columns`);
      }

      cells.push(ReceiptPrinterEncoder.#resolveCell(columns.slice(position, position + span), cell, layout, index));

      position += span;
    }

    if (position !== columns.length) {
      throw new Error(`The spans of row ${index + 1} do not add up to the number of columns`);
    }

    return cells;
  }

  /**
     * Resolve one cell of a table against the columns it covers. Its outer
     * margins are the left margin of the first column and the right margin of
     * the last, which the cell can override, its vertical alignment and its
     * overflow are those of the first column, and an alignment on the cell
     * itself overrides the alignment of that column. The sides of the border
     * the cell wants are resolved as well
     *
     * @param  {TableColumn[]}   covered    The columns the cell covers
     * @param  {TableCell}       cell       The contents of the cell
     * @param  {object}          layout     The styles and the rule columns of the table
     * @param  {number}          index      The position of the row in the data
     * @return {object}                     The cell, with its width, margins and border
     */
  static #resolveCell(covered, cell, layout, index) {
    const object = ReceiptPrinterEncoder.#isCellObject(cell);

    /* The vertical dividers the cell swallows are part of its width */

    let width = layout.inner ? covered.length - 1 : 0;

    for (let i = 0; i < covered.length; i++) {
      width += covered[i].width;

      if (i > 0) {
        width += covered[i].marginLeft || 0;
      }

      if (i < covered.length - 1) {
        width += covered[i].marginRight || 0;
      }
    }

    const first = covered[0];
    const last = covered[covered.length - 1];

    /* The margins of the cell override those of the columns it covers, on its
       outer sides only. A cell keeps the width of the columns it covers, so
       what its margins take is taken from its content */

    const marginLeft = ReceiptPrinterEncoder.#resolveMargin(cell, 'marginLeft', first.marginLeft || 0, index);
    const marginRight = ReceiptPrinterEncoder.#resolveMargin(cell, 'marginRight', last.marginRight || 0, index);

    width += (first.marginLeft || 0) - marginLeft + (last.marginRight || 0) - marginRight;

    if (width < 1) {
      throw new Error(`The margins of a cell of row ${index + 1} leave no room for its contents`);
    }

    return {
      width,
      marginLeft,
      marginRight,
      align: object && typeof cell.align !== 'undefined' ? cell.align : first.align,
      verticalAlign: first.verticalAlign,
      overflow: first.overflow,
      content: object ? cell.content : cell,
      border: ReceiptPrinterEncoder.#resolveBorder(cell, layout, index),
    };
  }

  /**
     * Resolve one margin of a cell of a table, which overrides the margin of
     * the column it falls in. A margin has to be a number of characters that
     * can be printed
     *
     * @param  {TableCell}   cell       The contents of the cell
     * @param  {string}      property   The margin to resolve, marginLeft or marginRight
     * @param  {number}      margin     The margin of the column the cell falls back on
     * @param  {number}      index      The position of the row in the data
     * @return {number}                 The margin of the cell
     */
  static #resolveMargin(cell, property, margin, index) {
    if (!ReceiptPrinterEncoder.#isCellObject(cell) || typeof cell[property] === 'undefined') {
      return margin;
    }

    if (!Number.isInteger(cell[property]) || cell[property] < 0) {
      throw new Error(`The margins of a cell of row ${index + 1} must be zero or a positive integer`);
    }

    return cell[property];
  }

  /**
     * Resolve the sides of the border a cell of a table wants. A plain cell
     * wants the lines of the table on every side, the object form can turn
     * them off, entirely with 'none' or per side. A table without any lines
     * ignores the property
     *
     * @param  {TableCell}       cell       The contents of the cell
     * @param  {object}          layout     The styles and the rule columns of the table
     * @param  {number}          index      The position of the row in the data
     * @return {object}                     True for every side the cell wants
     */
  static #resolveBorder(cell, layout, index) {
    if (!layout.bordered || !ReceiptPrinterEncoder.#isCellObject(cell) ||
        typeof cell.border === 'undefined') {
      return {top: true, right: true, bottom: true, left: true};
    }

    return ReceiptPrinterEncoder.#resolveSides(cell.border, layout.styles,
        `A cell of row ${index + 1} can only turn its border off`);
  }

  /**
     * The line styles a table draws with, which are the ones a cell may name
     * in its own border property: the style of the dividers between the cells
     * and the styles of the sides of the outline
     *
     * @param  {TableOptions}   options   The options of the table
     * @param  {object}         outline   The style of every side of the outline
     * @return {string[]}                 The styles the table draws with
     */
  static #tableStyles(options, outline) {
    return [...new Set([options.border, ...Object.values(outline)])].filter((style) => style !== 'none');
  }

  /**
     * Resolve the style of every side of the outline of a table, from a value
     * that is either a style for every side, or an object with any of top,
     * right, bottom and left, where a side that is left out is not drawn. A
     * table without an outline option has no frame around it
     *
     * @param  {TableOptions}   options   The options of the table
     * @return {object}                   The style of every side of the outline
     */
  static #resolveOutline(options) {
    const sides = {top: 'none', right: 'none', bottom: 'none', left: 'none'};
    const value = options.outline;
    const styles = ['none', 'single', 'double'];

    if (typeof value === 'undefined') {
      return sides;
    }

    if (typeof value === 'string') {
      if (!styles.includes(value)) {
        throw new Error('Unknown outline style');
      }

      for (const side of Object.keys(sides)) {
        sides[side] = value;
      }

      return sides;
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Unknown outline style');
    }

    ReceiptPrinterEncoder.#validateSides(value, sides, 'Unknown outline side');

    for (const side of Object.keys(sides)) {
      if (typeof value[side] === 'undefined') {
        continue;
      }

      if (!styles.includes(value[side])) {
        throw new Error('Unknown outline style');
      }

      sides[side] = value[side];
    }

    return sides;
  }

  /**
     * Check the keys of the object form of an outline or of the border of a
     * cell, which are the four sides of a border. Anything else is a typo that
     * would silently leave a side out
     *
     * @param  {object}   value     The value of the property
     * @param  {object}   sides     The sides a border has
     * @param  {string}   message   The message to throw for a key that is not a side
     */
  static #validateSides(value, sides, message) {
    for (const key of Object.keys(value)) {
      if (!(key in sides)) {
        throw new Error(`${message} ${key}`);
      }
    }
  }

  /**
     * Resolve the sides of the border of a cell, from a value that is either
     * a style for every side, or an object with any of top, right, bottom and
     * left, where a side that is left out keeps the line of the table. A cell
     * can only turn its border off: any other value, a style the table does
     * not draw with included, throws, because the lines of a cell are the
     * lines of the table around it
     *
     * @param  {'none' | 'single' | 'double' | TableCellBorder}   value     The value of the property
     * @param  {string[]} styles    The styles the table draws with, which are accepted as a no-op
     * @param  {string}   message   The message to throw for a value that is not allowed
     * @return {object}             True for every side that is drawn
     */
  static #resolveSides(value, styles, message) {
    const sides = {top: true, right: true, bottom: true, left: true};

    if (typeof value === 'string') {
      if (value !== 'none' && !styles.includes(value)) {
        throw new Error(message);
      }

      for (const side of Object.keys(sides)) {
        sides[side] = value !== 'none';
      }

      return sides;
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(message);
    }

    ReceiptPrinterEncoder.#validateSides(value, sides, 'Unknown border side');

    for (const side of Object.keys(sides)) {
      if (typeof value[side] === 'undefined') {
        continue;
      }

      if (value[side] !== 'none' && !styles.includes(value[side])) {
        throw new Error(message);
      }

      sides[side] = value[side] !== 'none';
    }

    return sides;
  }

  /**
     * Apply the styles of the table to the sides its cells asked for: the top
     * side of the cells of the first row, the bottom side of the cells of the
     * last row, the left side of the first cell of every row and the right
     * side of the last cell of every row are drawn in the style of that side
     * of the outline, every side between two cells in the style of the border.
     * A side of a cell is the style of the line there, or false where the cell
     * turned it off or the table does not draw a line there. A rule row has no
     * cells of its own, the lines it draws follow from the rows around it, so
     * the horizontal sides of a row with a neighbour above or below it are the
     * style of a rule row, which is drawn even when the table has no dividers
     * between its cells
     *
     * @param  {Array}    rows      The rows of the table, null for a rule row
     * @param  {object}   outline   The style of every side of the outline
     * @param  {string}   border    The style of the lines between the cells
     */
  static #applyStyles(rows, outline, border) {
    const rule = border === 'none' ? 'single' : border;

    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r];

      if (cells === null) {
        continue;
      }

      for (let c = 0; c < cells.length; c++) {
        const styles = {
          top: r === 0 ? outline.top : rule,
          right: c === cells.length - 1 ? outline.right : border,
          bottom: r === rows.length - 1 ? outline.bottom : rule,
          left: c === 0 ? outline.left : border,
        };

        for (const side of Object.keys(styles)) {
          cells[c].border[side] = cells[c].border[side] && styles[side] !== 'none' ? styles[side] : false;
        }
      }
    }
  }

  /**
     * Determine if a cell of a table is the object form, which can span
     * columns and turn its border off. Only a plain object is, anything else
     * is a plain cell: a string and a callback function are printed, and
     * everything else is an empty cell
     *
     * @param  {TableCell}   cell   The contents of the cell
     * @return {boolean}            True when the cell is the object form
     */
  static #isCellObject(cell) {
    return cell !== null && typeof cell === 'object' && !Array.isArray(cell);
  }

  /**
     * The style of the vertical rule at every boundary of one row of a
     * bordered table: the left edge of the table, every boundary between two
     * cells and the right edge, which is one more than the number of cells. A
     * rule is drawn when the cell on its left wants its right side or the cell
     * on its right wants its left side, in the style of that side, which is
     * the style of the outline at the edges and the style of the border
     * between two cells. A cell that spans columns has no boundary inside it
     *
     * @param  {object[]}   cells   The cells of the row
     * @return {Array}              The style of every boundary with a vertical rule, false for the others
     */
  static #tableEdges(cells) {
    const edges = [];

    for (let c = 0; c <= cells.length; c++) {
      edges.push((c > 0 && cells[c - 1].border.right) || (c < cells.length && cells[c].border.left) || false);
    }

    return edges;
  }

  /**
     * The positions of the vertical rules of one row of a bordered table, the
     * boundaries of #tableEdges() that are drawn, with the style of each. A
     * row without cells, which is a neighbour of a rule row that is not there,
     * has none. A boundary between two cells has a column of its own only when
     * the table has a border, an outer rule only when that side of the outline
     * is drawn, so without the left side of the outline the first cell starts
     * at the first character of the table
     *
     * @param  {object[]}   cells    The cells of the row
     * @param  {object}     layout   The styles and the rule columns of the table
     * @return {Map}                 The style of the vertical rule at every position that has one
     */
  static #tableRules(cells, layout) {
    const edges = ReceiptPrinterEncoder.#tableEdges(cells);
    const positions = new Map();
    let position = layout.outline.left !== 'none' ? 0 : -1;

    for (let c = 0; c < cells.length; c++) {
      const column = c === 0 ? layout.outline.left !== 'none' : layout.inner;

      if (column && edges[c]) {
        positions.set(position, edges[c]);
      }

      position += cells[c].marginLeft + cells[c].width + cells[c].marginRight +
        (ReceiptPrinterEncoder.#tableColumn(cells, c, layout) ? 1 : 0);
    }

    if (cells.length > 0 && layout.outline.right !== 'none' && edges[cells.length]) {
      positions.set(position, edges[cells.length]);
    }

    return positions;
  }

  /**
     * Whether the boundary on the right of one cell of a row has a column of
     * its own: a boundary between two cells only when the table has a border,
     * the right edge of the table only when that side of the outline is drawn
     *
     * @param  {object[]}   cells    The cells of the row
     * @param  {number}     c        The position of the cell in the row
     * @param  {object}     layout   The styles and the rule columns of the table
     * @return {boolean}             True when the boundary has a column of its own
     */
  static #tableColumn(cells, c, layout) {
    return c < cells.length - 1 ? layout.inner : layout.outline.right !== 'none';
  }

  /**
     * The character positions a horizontal line of a bordered table is drawn
     * over: the segment over the width of a cell, from the boundary on its
     * left up to and including the boundary on its right, is drawn when the
     * cell above it wants its bottom side or the cell below it wants its top
     * side. Either row can be empty, which is the top and the bottom border
     * of the table. A segment stops at the edge of the table, and a boundary
     * that has no column of its own takes no character
     *
     * @param  {object[]}   above    The cells of the row above the line
     * @param  {object[]}   below    The cells of the row below the line
     * @param  {object}     layout   The styles and the rule columns of the table
     * @param  {number}     width    The width of the table in characters
     * @return {Set}                 The character positions the line covers
     */
  static #tableSegments(above, below, layout, width) {
    const positions = new Set();

    for (const [cells, side] of [[above, 'bottom'], [below, 'top']]) {
      let position = layout.outline.left !== 'none' ? 0 : -1;

      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        const end = position + cell.marginLeft + cell.width + cell.marginRight +
          (ReceiptPrinterEncoder.#tableColumn(cells, c, layout) ? 1 : 0);

        if (cell.border[side]) {
          for (let p = Math.max(position, 0); p <= Math.min(end, width - 1); p++) {
            positions.add(p);
          }
        }

        position = end;
      }
    }

    return positions;
  }

  /**
     * The shape of the border glyph at one character position, from the four
     * directions in which a line runs from it. A position no line runs from is
     * blank, and so is a position a single vertical line runs into: a corner
     * that points into nothing draws a line that is not there, the rule simply
     * ends at the row above it or starts at the row below it. A blank position
     * is printed as a space, so that the column is kept
     *
     * @param  {boolean}   up      True when the row above has a vertical rule here
     * @param  {boolean}   down    True when the row below has a vertical rule here
     * @param  {boolean}   left    True when the line continues to the left
     * @param  {boolean}   right   True when the line continues to the right
     * @return {string}            The name of the shape
     */
  static #borderShape(up, down, left, right) {
    if (!left && !right && !(up && down)) {
      return 'blank';
    }

    if (up && down) {
      if (left && right) {
        return 'middle';
      }

      if (right) {
        return 'left';
      }

      if (left) {
        return 'right';
      }

      return 'vertical';
    }

    if (left && right) {
      if (up) {
        return 'bottom';
      }

      if (down) {
        return 'top';
      }

      return 'horizontal';
    }

    if (down) {
      return right ? 'topLeft' : 'topRight';
    }

    if (up) {
      return right ? 'bottomLeft' : 'bottomRight';
    }

    return 'horizontal';
  }

  /**
     * The shape of the glyph at every character position of one horizontal
     * line of a bordered table: the top border, the bottom border or a rule
     * row. The shape follows from the connectivity at that position: a
     * vertical rule in the row above, a vertical rule in the row below, and
     * the horizontal line itself to the left and to the right, which runs
     * from a position when that position and its neighbour are both covered
     * by an owned segment.
     *
     * The glyph at a junction follows from the shape and from one style per
     * axis: the style of the horizontal line, which is the style of the side
     * of the outline for the top and the bottom border and the style of a rule
     * row in between, and the style of the vertical rule that runs through it,
     * which is the same above and below the line
     *
     * @param  {number}   width      The width of the table in characters
     * @param  {Map}      up         The styles of the vertical rules above the line, per position
     * @param  {Map}      down       The styles of the vertical rules below the line, per position
     * @param  {Set}      covered    The positions the horizontal line covers
     * @param  {string}   style      The style of the horizontal line itself
     * @return {object[]|null}       The shape and the styles at every position, or null when the
     *                               line is blank over its whole width
     */
  static #tableShapes(width, up, down, covered, style) {
    const shapes = [];
    let blank = true;

    for (let position = 0; position < width; position++) {
      const shape = ReceiptPrinterEncoder.#borderShape(
          up.has(position), down.has(position),
          covered.has(position - 1) && covered.has(position),
          covered.has(position) && covered.has(position + 1),
      );

      blank = blank && shape === 'blank';

      shapes.push({
        shape,
        horizontal: style,
        vertical: up.get(position) || down.get(position) || style,
      });
    }

    return blank ? null : shapes;
  }

  /**
     * Add one horizontal line of a table to the composer, from the shapes of
     * #tableShapes(). A line that is blank over its whole width is not printed
     * at all
     *
     * @param  {function}        glyphs     The glyphs and code pages of the border, per pair of styles
     * @param  {object[]|null}   shapes     The shape and the styles at every character position, or null
     */
  #tableBorder(glyphs, shapes) {
    if (shapes === null) {
      return;
    }

    /* The glyphs of a border can come from more than one code page, and a
       position no line runs from is a space. A run of glyphs from the same
       page, or of spaces, is printed as one fragment */

    const fragments = [];

    for (const {shape, horizontal, vertical} of shapes) {
      const element = shape === 'blank' ?
        {glyph: ' ', codepage: null} :
        glyphs(horizontal, vertical)[shape];
      const last = fragments.length > 0 ? fragments[fragments.length - 1] : null;

      if (last !== null && last.codepage === element.codepage) {
        last.value += element.glyph;
        continue;
      }

      fragments.push({codepage: element.codepage, value: element.glyph});
    }

    for (const fragment of fragments) {
      if (fragment.codepage === null) {
        this.#composer.space(fragment.value.length);
        continue;
      }

      this.#composer.text(fragment.value, fragment.codepage);
    }
  }

  /**
     * Add one row of a table to the composer. Every printed line of the row is
     * the lines of its cells side by side, with their margins between them,
     * and with a vertical rule at the edges and at every boundary between two
     * cells when the table draws a line there and one of the cells there wants
     * it. The vertical rules are as tall as the tallest content of that
     * printed line, the way a box draws them. A boundary without a column of
     * its own, an outer rule whose side of the outline is not drawn or a
     * divider in a table without a border, takes no character at all, the
     * table is one character narrower there.
     *
     * @param  {object[]}      cells      The cells of the row, with their widths and margins
     * @param  {function}      glyphs     The glyphs and code pages of the border, per pair of styles
     * @param  {object}        layout     The styles and the rule columns of the table
     * @param  {LineSpacing}   previous   The line spacing to restore after a row that asked for none
     * @param  {boolean}       restore    True when this row restores the line spacing on its last
     *                                    line, because the table has no bottom border to restore it on
     */
  #tableRow(cells, glyphs, layout, previous, restore) {
    const lines = [];
    const bordered = layout.bordered;

    /* The boundaries of this row a vertical rule is drawn at */

    const edges = bordered ? ReceiptPrinterEncoder.#tableEdges(cells) : [];

    /* A bordered row always prints at least one line, its vertical rules are
       part of the frame of the table */

    let maxLines = bordered ? 1 : 0;

    /* A cell with a border needs the lines of the whole row printed without
       line spacing, because its vertical lines have to touch the lines of
       the rows above and below it */

    let tight = false;

    /* Render all cells */

    for (let c = 0; c < cells.length; c++) {
      const columnEncoder = new ReceiptPrinterEncoder(Object.assign({}, this.#options, {
        width: cells[c].width * this.#composer.style.width,
        embedded: true,
        style: this.#inheritedStyle(),
        overflow: cells[c].overflow,
        borders: () => this.#borders(),
      }));

      columnEncoder.codepage(this.#codepage);

      if (typeof cells[c].align !== 'undefined') {
        columnEncoder.align(cells[c].align);
      }

      if (typeof cells[c].content === 'string') {
        columnEncoder.text(cells[c].content);
      }

      if (typeof cells[c].content === 'function') {
        cells[c].content(columnEncoder);
      }

      const cell = columnEncoder.commands();

      tight = tight || columnEncoder.#tight;

      /* Determine the height in lines of the row */

      maxLines = Math.max(maxLines, cell.length);

      lines[c] = cell;
    }

    /* Pad the cells in this row to the same height */

    for (let c = 0; c < cells.length; c++) {
      while (lines[c].length < maxLines) {
        const line = {
          commands: LineComposer.padding(
              cells[c].width * this.#composer.style.width,
              {width: this.#composer.style.width, height: this.#composer.style.height},
          ),
          height: 1,
        };

        if (cells[c].verticalAlign === 'bottom') {
          lines[c].unshift(line);
        } else {
          lines[c].push(line);
        }
      }
    }

    /* The vertical rules are as tall as the line, the current height is restored after them */

    const height = this.#composer.style.height;

    /* Add the lines to the composer */

    for (let l = 0; l < maxLines; l++) {
      if (tight && !bordered && l === 0) {
        this.#setLineSpacing('none');
      }

      const tallest = bordered ? Math.max(height, ...lines.map((cell) => cell[l].height)) : height;

      if (bordered && layout.outline.left !== 'none') {
        this.#tableRule(glyphs, tallest, height, edges[0]);
      }

      for (let c = 0; c < cells.length; c++) {
        if (cells[c].marginLeft) {
          this.#composer.space(cells[c].marginLeft);
        }

        this.#composer.add(lines[c][l].commands, cells[c].width * this.#composer.style.width);

        if (cells[c].marginRight) {
          this.#composer.space(cells[c].marginRight);
        }

        if (bordered && ReceiptPrinterEncoder.#tableColumn(cells, c, layout)) {
          this.#tableRule(glyphs, tallest, height, edges[c + 1]);
        }
      }

      if (l === maxLines - 1 && (restore || (tight && !bordered))) {
        this.#setLineSpacing(previous);
      }

      this.#composer.flush();
    }
  }

  /**
     * Add one vertical rule of a bordered table to the composer, as tall as
     * the tallest content of the line it is part of. A boundary neither of the
     * cells next to it wants is a space, so that the row stays as wide as the
     * table
     *
     * @param  {function}  glyphs    The glyphs and code pages of the border, per pair of styles
     * @param  {number}    tallest   The height of the tallest content of the line
     * @param  {number}    height    The height to restore after the rule
     * @param  {string|boolean}   style   The style of the rule, or false when it is not drawn
     */
  #tableRule(glyphs, tallest, height, style) {
    if (!style) {
      this.#composer.space(1);
      return;
    }

    const element = glyphs(style, style).vertical;

    this.#composer.style.height = tallest;
    this.#composer.text(element.glyph, element.codepage);
    this.#composer.style.height = height;
  }

  /**
     * Resolve the widths of the columns of a table. A column without a width,
     * or with a width of 'auto', is a fill column: it takes the space that is
     * left after the fixed columns and all margins. If there are multiple fill
     * columns, the remaining space is divided evenly between them, the first
     * ones get any remainder. Widths are in characters of the current size.
     *
     * The columns are resolved against the width of the table, which is the
     * width of the paper when the table does not have one of its own. One
     * character per vertical rule is part of the fixed width, which is one per
     * boundary between two cells when the table has a border and one for the
     * left and for the right side of the outline where those are drawn, so a
     * table with a fill column and a border fills its width exactly.
     *
     * @param  {TableColumn[]}   columns    The column definitions
     * @param  {number}          [width]    The width of the table in characters of the current size
     * @param  {boolean}         inner      True when the table has a divider between two cells
     * @param  {object}          outline    The style of every side of the outline
     * @return {TableColumn[]}              The column definitions with numeric widths
     */
  #resolveColumns(columns, width, inner, outline) {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new Error('A table needs at least one column');
    }

    const fill = [];
    let fixed = 0;

    for (const column of columns) {
      if (typeof column.overflow !== 'undefined' && !['wrap', 'clip', 'ellipsis'].includes(column.overflow)) {
        throw new Error('Column overflow must be wrap, clip or ellipsis');
      }

      if (typeof column.width === 'undefined' || column.width === 'auto') {
        fill.push(column);
      } else if (!Number.isInteger(column.width) || column.width < 1) {
        throw new Error('Column width must be a positive integer, or auto');
      } else {
        fixed += column.width;
      }

      fixed += (column.marginLeft || 0) + (column.marginRight || 0);
    }

    /* Every vertical rule of a bordered table takes one character: the
       dividers between the cells only when the table has a border, the outer
       rules only where the outline is drawn */

    fixed += (inner ? columns.length - 1 : 0) +
      (outline.left !== 'none' ? 1 : 0) + (outline.right !== 'none' ? 1 : 0);

    /* The available width is the width of the table, or of the line, in characters of the current size */

    const available = typeof width === 'undefined' ?
      Math.floor(this.#composer.columns / this.#composer.style.width) :
      width;

    const remaining = available - fixed;

    /* Without fill columns the table must simply fit, with fill columns each of them needs at least one character */

    if (remaining < 0 || (fill.length > 0 && remaining < fill.length)) {
      throw new Error('Table is too wide');
    }

    const widths = new Map();

    fill.forEach((column, i) => {
      widths.set(column, Math.floor(remaining / fill.length) + (i < remaining % fill.length ? 1 : 0));
    });

    return columns.map((column) =>
      widths.has(column) ? Object.assign({}, column, {width: widths.get(column)}) : column);
  }

  /**
     * Get the styles that embedded content, such as table cells and boxes,
     * inherits from the current style. The widths of columns and boxes are
     * in characters of the current size, so the embedded content is measured
     * in columns of the paper.
     *
     * @return {object}   The inherited style properties
     */
  #inheritedStyle() {
    return {
      bold: this.#composer.style.bold,
      italic: this.#composer.style.italic,
      underline: this.#composer.style.underline,
      invert: this.#composer.style.invert,
      width: this.#composer.style.width,
      height: this.#composer.style.height,
    };
  }

  /**
     * Insert a horizontal rule
     *
     * @param  {RuleOptions}     [options]  And object with the following properties:
     *                                      - style: The style of the line, either single or double
     *                                      - width: The width of the line, by default the width of the paper
     * @return {ReceiptPrinterEncoder}                   Return the object, for easy chaining commands
     *
     */
  rule(options) {
    options = Object.assign({
      style: 'single',
      width: this.#options.columns || 10,
    }, options || {});

    this.#composer.flush();

    this.#composer.text(
        (options.style === 'double' ? '═' : '─').repeat(
            Math.floor(options.width / this.#composer.style.width),
        ),
        'cp437',
    );
    this.#composer.flush({forceNewline: true});

    return this;
  }

  /**
     * Insert a box
     *
     * @param  {BoxOptions}       options   And object with the following properties:
     *                                      - outline: The style of the border around the box, either none,
     *                                        single or double
     *                                      - corners: The style of the corners, either square or rounded
     *                                      - width: The width of the box, by default the width of the paper
     *                                      - marginLeft: Space between the left border and the left edge
     *                                      - marginRight: Space between the right border and the right edge
     *                                      - paddingLeft: Space between the contents and the left border of the box
     *                                      - paddingRight: Space between the contents and the right border of the box
     * @param  {BoxContent}       contents  A string value, or a callback function.
     *                                      The first parameter of the callback is the encoder object on
     *                                      which the function can call its methods.
     * @return {ReceiptPrinterEncoder}                     Return the object, for easy chaining commands
     *
     */
  box(options, contents) {
    options = Object.assign({
      style: 'single',
      corners: 'square',
      width: this.#options.columns,
      marginLeft: 0,
      marginRight: 0,
      paddingLeft: 0,
      paddingRight: 0,
    }, options || {});

    /* The border of a box is the outline option, which is called border on a
       table, where it is the style of the lines between the cells instead */

    if (typeof options.border !== 'undefined') {
      throw new Error('The border option of a box is called outline');
    }

    /* The style option is the old name of the outline option, which wins when both are given */

    const outline = typeof options.outline === 'undefined' ? options.style : options.outline;

    if (!['none', 'single', 'double'].includes(outline)) {
      throw new Error('Unknown outline style');
    }

    if (!['square', 'rounded'].includes(options.corners)) {
      throw new Error('Unknown corners');
    }

    if (!Number.isInteger(options.width) || options.width < 1) {
      throw new Error('Box width must be a positive integer');
    }

    const boxWidth = (options.width + options.marginLeft + options.marginRight) * this.#composer.style.width;

    if (boxWidth > this.#options.columns) {
      throw new Error('Box is too wide');
    }

    const bordered = outline !== 'none';
    const elements = bordered ? this.#borders().glyphs(outline, outline, options.corners) : null;

    /* Render the contents of the box */

    const innerWidth = options.width - (bordered ? 2 : 0) - options.paddingLeft - options.paddingRight;

    if (innerWidth < 0) {
      throw new Error('Box is too narrow');
    }

    const columnEncoder = new ReceiptPrinterEncoder(Object.assign({}, this.#options, {
      width: innerWidth * this.#composer.style.width,
      embedded: true,
      style: this.#inheritedStyle(),
      borders: () => this.#borders(),
    }));

    columnEncoder.codepage(this.#codepage);

    if (typeof options.align !== 'undefined') {
      columnEncoder.align(options.align);
    }

    if (typeof contents === 'function') {
      contents(columnEncoder);
    }

    if (typeof contents === 'string') {
      columnEncoder.text(contents);
    }

    const lines = columnEncoder.commands();

    /* The lines of the box are printed without line spacing when it has a
       border, or when its contents contain something that needs it, such as a
       bordered box or table. An embedded box passes the request on to the
       encoder it is embedded in, which wraps the lines it is part of */

    const previous = this.#state.lineSpacing;
    const tight = bordered || (columnEncoder.#tight && lines.length > 0);

    /* The vertical borders are as tall as the line, the current height is restored after them */

    const height = this.#composer.style.height;

    /* Header */

    this.#composer.flush();

    if (tight) {
      /* Without line spacing the vertical lines of consecutive lines touch */

      this.#setLineSpacing('none');
    }

    if (bordered) {
      this.#composer.space(options.marginLeft);
      this.#composer.text(elements.topLeft.glyph, elements.topLeft.codepage);
      this.#composer.text(elements.horizontal.glyph.repeat(options.width - 2), elements.horizontal.codepage);
      this.#composer.text(elements.topRight.glyph, elements.topRight.codepage);
      this.#composer.space(options.marginRight);
      this.#composer.flush();
    }

    /* Content */

    for (let i = 0; i < lines.length; i++) {
      this.#composer.space(options.marginLeft);

      if (bordered) {
        this.#composer.style.height = Math.max(height, lines[i].height);
        this.#composer.text(elements.vertical.glyph, elements.vertical.codepage);
        this.#composer.style.height = height;
      }

      this.#composer.space(options.paddingLeft);
      this.#composer.add(lines[i].commands, innerWidth * this.#composer.style.width);
      this.#composer.space(options.paddingRight);

      if (bordered) {
        this.#composer.style.height = Math.max(height, lines[i].height);
        this.#composer.text(elements.vertical.glyph, elements.vertical.codepage);
        this.#composer.style.height = height;
      }

      this.#composer.space(options.marginRight);

      /* A box without a border restores the line spacing on its last line */

      if (tight && !bordered && i === lines.length - 1) {
        this.#setLineSpacing(previous);
      }

      this.#composer.flush();
    }

    /* Footer */

    if (bordered) {
      this.#composer.space(options.marginLeft);
      this.#composer.text(elements.bottomLeft.glyph, elements.bottomLeft.codepage);
      this.#composer.text(elements.horizontal.glyph.repeat(options.width - 2), elements.horizontal.codepage);
      this.#composer.text(elements.bottomRight.glyph, elements.bottomRight.codepage);
      this.#composer.space(options.marginRight);

      /* Restore the line spacing before the line feed of the bottom border,
         so that the paper is fed as usual after the box */

      if (tight) {
        this.#setLineSpacing(previous);
      }

      this.#composer.flush();
    }

    return this;
  }

  /**
     * Print Markdown
     *
     * Parses a subset of GitHub Flavored Markdown and queues the commands that
     * are equivalent to it. Everything it prints goes through the commands of
     * the encoder, so it can be used inside table cells and boxes as well. The
     * current alignment, font and code page apply to everything it prints, and
     * the current style is the base of every inline run: a run sets a style and
     * restores the value it found afterwards.
     *
     * @param  {string}   value   The Markdown source that needs to be printed
     * @return {ReceiptPrinterEncoder}          Return the object, for easy chaining commands
     *
     */
  markdown(value) {
    for (const block of Markdown.parse(value)) {
      switch (block.type) {
        case 'blank':
          this.newline();
          break;

        case 'heading':
          this.#markdownHeading(block);
          break;

        case 'rule':
          this.rule();
          break;

        case 'table':
          this.#markdownTable(block);
          break;

        case 'list':
          this.#markdownList(block);
          break;

        default:
          this.#markdownContent(block.content);
          this.newline();
      }
    }

    return this;
  }

  /**
     * Print a receiptline document. The layout comes from the receiptline
     * module given in the options, @point-of-sale/receiptline, which prints
     * the document through the regular commands. This is the one command
     * that is async, because the images in a document have to be decoded,
     * so it has to be awaited before the next command.
     *
     * @param  {string}   value      The receiptline document
     * @param  {object}   [options]  The options of the module, see its documentation
     * @return {Promise<ReceiptPrinterEncoder>}   Resolves with the object, for chaining the commands that follow
     *
     */
  receiptline(value, options) {
    /* The checks are synchronous, so that a wrong use throws right away
       instead of rejecting later, like every other command */

    if (this.#options.embedded) {
      throw new Error('Printing a receiptline document is not supported in table cells or boxes');
    }

    if (this.#options.receiptline === null || typeof this.#options.receiptline.transform !== 'function') {
      throw new Error(
          'Printing a receiptline document needs the receiptline option, ' +
          'set it to the @point-of-sale/receiptline module when creating the encoder',
      );
    }

    return Promise.resolve(this.#options.receiptline.transform(this, value, options)).then(() => this);
  }

  /**
     * Print a heading of a Markdown document. A first level heading is printed
     * at double size, a second level heading at double height, and a heading
     * of the third level and deeper at the current size. All of them are bold,
     * and the size and the bold style that were active before it are restored.
     *
     * @param  {object}   block   The heading block, with its level and content
     */
  #markdownHeading(block) {
    const bold = this.#composer.style.bold;
    const width = this.#composer.style.width;
    const height = this.#composer.style.height;

    if (block.level === 1) {
      this.size(2, 2);
    }

    if (block.level === 2) {
      this.size(1, 2);
    }

    this.bold(true);
    this.#markdownContent(block.content);
    this.bold(bold);
    this.size(width, height);
    this.newline();
  }

  /**
     * Print a pipe table of a Markdown document. Every column is as wide as
     * its longest cell, measured without the markup, and the columns are one
     * space apart. When they do not fit the width that is available, the
     * widest column loses one character at a time until they do, and the text
     * of a column that lost characters wraps. When they leave space over, the
     * widest column takes all of it, so that the table is as wide as the space
     * it is printed in. When not even one character per column fits, the rows
     * are printed as lines of text instead.
     *
     * @param  {object}   block   The table block, with its alignments, widths and rows
     */
  #markdownTable(block) {
    const gaps = block.align.length - 1;
    const available = Math.floor(this.#composer.columns / this.#composer.style.width);

    /* A table that cannot be made to fit, in a column narrower than one
       character per cell, is printed as lines of text rather than thrown away */

    if (available < gaps + block.align.length) {
      if (block.header) {
        const bold = this.#composer.style.bold;

        this.bold(true);
        this.#markdownCells(block.header);
        this.bold(bold);
        this.newline();
      }

      for (const row of block.rows) {
        this.#markdownCells(row);
        this.newline();
      }

      return;
    }

    const widths = Markdown.expand(Markdown.fit(block.widths, available - gaps), available - gaps);

    const columns = block.align.map((align, i) => ({
      width: widths[i],
      align,
      marginRight: i < gaps ? 1 : 0,
    }));

    const rows = block.rows.map((row) => row.map((cell) => (encoder) => encoder.#markdownContent(cell)));

    /* The header row is printed in bold, a header without content is left out */

    if (block.header) {
      rows.unshift(block.header.map((cell) => (encoder) => encoder.#markdownHeader(cell)));
    }

    this.table(columns, rows);
  }

  /**
     * Print the cells of one row of a Markdown table as text, one space apart,
     * which is what a table that is too narrow for a layout falls back to
     *
     * @param  {Array<object[]>}   cells   The inline content of every cell of the row
     */
  #markdownCells(cells) {
    cells.forEach((cell, index) => {
      if (index > 0) {
        this.text(' ');
      }

      this.#markdownContent(cell);
    });
  }

  /**
     * Print one cell of the header row of a Markdown table, which is bold on
     * top of the style the cell inherits
     *
     * @param  {object[]}   cell   The inline content of the cell
     */
  #markdownHeader(cell) {
    const bold = this.#composer.style.bold;

    this.bold(true);
    this.#markdownContent(cell);
    this.bold(bold);
  }

  /**
     * Print a list of a Markdown document as a table with a marker column and
     * a fill column, so that the lines of an item that wraps hang under the
     * text of that item instead of under its marker. When the marker column
     * does not leave at least one character for the text, every item is
     * printed as a line of text with its marker in front of it instead.
     *
     * @param  {object}   block   The list block, with its items and the width of the marker column
     */
  #markdownList(block) {
    const available = Math.floor(this.#composer.columns / this.#composer.style.width);

    if (available < block.width + 1) {
      for (const item of block.items) {
        this.text(`${item.marker} `);
        this.#markdownContent(item.content);
        this.newline();
      }

      return;
    }

    this.table(
        [{width: block.width}, {}],
        block.items.map((item) => [item.marker, (encoder) => encoder.#markdownContent(item.content)]),
    );
  }

  /**
     * Print the inline content of a block of a Markdown document. A styled run
     * sets its style and restores the value it found afterwards, so a run
     * inside a context that already has that style is a no-op.
     *
     * @param  {object[]}   nodes   The inline content, text and styled runs
     */
  #markdownContent(nodes) {
    for (const node of nodes) {
      if (node.type === 'text') {
        this.text(node.value);
        continue;
      }

      const previous = this.#composer.style[node.style];

      this[node.style](true);
      this.#markdownContent(node.content);
      this[node.style](previous);
    }
  }

  /**
     * Print a block that advances the paper by itself, such as an image, a
     * barcode, a QR code or a PDF417 code. Blocks cannot be padded with
     * spaces, so they are aligned with the alignment command of the printer.
     *
     * The block gets a line of its own, with the alignment command in front of
     * it. The reset to left alignment is sent on the next line, after the line
     * feed, because printers only process an alignment command at the start of
     * a line. That line holds nothing but the reset, so it gets no line feed of
     * its own and no empty line is printed.
     *
     * The alignment of the composer is not changed, the text lines that follow
     * are padded with spaces as before.
     *
     * @param  {object[]}   items   The items of the block, as returned by the language
     */
  #block(items) {
    /* Force printing the print buffer and moving to a new line */

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    const align = this.#composer.align;

    /* Set alignment */

    if (align !== 'left') {
      this.#composer.add(this.#language.align(align));
    }

    /* The block itself */

    this.#composer.add(items);

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    /* Reset alignment, on the line after the block */

    if (align !== 'left') {
      this.#composer.add(this.#language.align('left'));

      this.#composer.flush({forceFlush: true, ignoreAlignment: true});
    }
  }

  /**
     * Barcode
     *
     * @param  {string}                       value  the value of the barcode
     * @param  {BarcodeSymbology|number}      symbology  the type of the barcode
     * @param  {number|BarcodeOptions}        [height]  Either the configuration object, or backwards compatible height of the barcode
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  barcode(value, symbology, height) {
    let options = {
      height: 60,
      width: 2,
      text: 'none',
    };

    if (typeof height === 'object') {
      options = Object.assign(options, height);
    }

    if (typeof height === 'number') {
      options.height = height;
    }

    /* The text option names where the human readable text goes; the booleans
       of earlier versions still work, true is below and false is none */

    if (options.text === true) {
      options.text = 'below';
    }

    if (options.text === false) {
      options.text = 'none';
    }

    if (!['none', 'above', 'below', 'both'].includes(options.text)) {
      throw new Error(`Barcode text must be 'none', 'above', 'below' or 'both'`);
    }

    if (this.#options.embedded) {
      throw new Error('Barcodes are not supported in table cells or boxes');
    }

    if (this.#printerCapabilities.barcodes.supported === false) {
      return this.#error('Barcodes are not supported by this printer', 'relaxed');
    }

    if (typeof symbology === 'string' && !this.#printerCapabilities.barcodes.symbologies.includes(symbology)) {
      return this.#error(`Symbology '${symbology}' not supported by this printer`, 'relaxed');
    }

    /* Barcode */

    this.#block(
        this.#language.barcode(value, symbology, options),
    );

    return this;
  }

  /**
     * QR code
     *
     * @param  {string}              value       The value of the qr code
     * @param  {number|QRCodeOptions}    [model]       Either the configuration object, or
     *                                            backwards compatible model of the qrcode, either 1 or 2
     * @param  {number}              [size]        Backwards compatible size of the qrcode, a value between 1 and 8
     * @param  {string}              [errorlevel]  Backwards compatible the amount of error correction used,
     *                                            either 'l', 'm', 'q', 'h'
     * @return {ReceiptPrinterEncoder}                       Return the object, for easy chaining commands
     */
  qrcode(value, model, size, errorlevel) {
    let options = {
      model: 2,
      size: 6,
      errorlevel: 'm',
    };

    if (typeof model === 'object') {
      options = Object.assign(options, model);
    }

    if (typeof model === 'number') {
      options.model = model;
    }

    if (typeof size === 'number') {
      options.size = size;
    }

    if (typeof errorlevel === 'string') {
      options.errorlevel = errorlevel;
    }

    if (this.#options.embedded) {
      throw new Error('QR codes are not supported in table cells or boxes');
    }

    if (this.#printerCapabilities.qrcode.supported === false) {
      return this.#error('QR codes are not supported by this printer', 'relaxed');
    }

    if (options.model && !this.#printerCapabilities.qrcode.models.includes(String(options.model))) {
      return this.#error('QR code model is not supported by this printer', 'relaxed');
    }

    /* QR code */

    this.#block(
        this.#language.qrcode(value, options),
    );

    return this;
  }


  /**
     * PDF417 code
     *
     * @param  {string}           value     The value of the pdf417 code
     * @param  {PDF417Options}    [options]   Configuration object
     * @return {ReceiptPrinterEncoder}                     Return the object, for easy chaining commands
     *
     */
  pdf417(value, options) {
    options = Object.assign({
      width: 3,
      height: 3,
      columns: 0,
      rows: 0,
      errorlevel: 1,
      truncated: false,
    }, options || {});

    if (this.#options.embedded) {
      throw new Error('PDF417 codes are not supported in table cells or boxes');
    }

    if (this.#printerCapabilities.pdf417.supported === false) {
      /* If possible, fallback to a barcode with symbology */

      if (typeof this.#printerCapabilities.pdf417.fallback === 'object') {
        return this.barcode(value, this.#printerCapabilities.pdf417.fallback.symbology);
      }

      return this.#error('PDF417 codes are not supported by this printer', 'relaxed');
    }

    /* PDF417 code */

    this.#block(
        this.#language.pdf417(value, options),
    );

    return this;
  }


  // eslint-disable-next-line valid-jsdoc
  /**
     * Print an image
     *
     * @overload
     * @param {ImageInput} input   An element, like a canvas or image, or pixel data that needs to be printed
     * @param {ImageOptions} [options]   Size and dithering options, see below
     * @return {ReceiptPrinterEncoder}
     */
  // eslint-disable-next-line valid-jsdoc
  /**
     * @overload
     * @param {ImageInput} input   An element, like a canvas or image, or pixel data that needs to be printed
     * @param {number} width   Width of the image on the paper in dots
     * @param {number} height   Height of the image on the paper in dots
     * @param {DitherAlgorithm} [algorithm]   The dithering algorithm for making the image black and white
     * @param {number} [threshold]   Threshold for the dithering algorithm
     * @return {ReceiptPrinterEncoder}
     */
  /**
     * @param  {ImageInput}  input   An element, like a canvas or image, or pixel data that needs to be printed
     * @param  {number|ImageOptions}  [width]   Width of the image in dots, or an options object with:
     *                                          - width: the width in dots, if left out it follows from the height
     *                                          - height: the height in dots, if left out it follows from the width
     *                                          - algorithm: the dithering algorithm, defaults to threshold
     *                                          - threshold: threshold for the dithering algorithm, defaults to 128
     *                                          - mode: column or raster, the ESC/POS image command for this
     *                                            image, defaults to the imageMode option of the encoder
     *                                          Without a width and height the image is printed at its own size,
     *                                          scaled down when it is wider than the paper. Sizes are rounded up
     *                                          to a multiple of 8 dots, the extra dots are white.
     * @param  {number}  [height]   Height of the image on the paper in dots
     * @param  {DitherAlgorithm}  [algorithm]   The dithering algorithm for making the image black and white
     * @param  {number}  [threshold]   Threshold for the dithering algorithm
     * @return {ReceiptPrinterEncoder}   Return the object, for easy chaining commands
     *
     */
  image(input, width, height, algorithm, threshold) {
    let options = {
      width: undefined,
      height: undefined,
      algorithm: 'threshold',
      threshold: 128,
      mode: this.#options.imageMode,
    };

    if (typeof width === 'object' && width !== null) {
      options = Object.assign(options, width);
    } else {
      if (typeof width !== 'undefined') {
        options.width = width;
      }

      if (typeof height !== 'undefined') {
        options.height = height;
      }

      if (typeof algorithm !== 'undefined') {
        options.algorithm = algorithm;
      }

      if (typeof threshold !== 'undefined') {
        options.threshold = threshold;
      }
    }

    if (this.#options.embedded) {
      throw new Error('Images are not supported in table cells or boxes');
    }

    for (const dimension of ['width', 'height']) {
      if (typeof options[dimension] !== 'undefined' && (!Number.isInteger(options[dimension]) || options[dimension] < 1)) {
        throw new Error(`Image ${dimension} must be a positive integer`);
      }
    }

    if (options.mode !== 'column' && options.mode !== 'raster') {
      throw new Error('Image mode must be column or raster');
    }

    /* Determine the type of the input */

    const name = input.constructor.name;
    let type;

    name.endsWith('Element') || name == 'ImageBitmap' ? type = 'element' : null;
    name == 'ImageData' ? type = 'imagedata' : null;
    name == 'Canvas' && typeof input.getContext !== 'undefined' ? type = 'node-canvas' : null;
    name == 'Image' ? type = 'node-canvas-image' : null;
    name == 'Image' && typeof input.frames !== 'undefined' ? type = 'node-read-image' : null;
    name == 'Object' && input.data && input.info ? type = 'node-sharp' : null;
    name == 'View3duint8' && input.data && input.shape ? type = 'ndarray' : null;
    name == 'Object' && input.data && input.width && input.height ? type = 'object' : null;

    if (!type) {
      throw new Error('Could not determine the type of image input');
    }

    /* Determine the size of the image on the paper. A missing width or height
       follows from the other one and the size of the input, keeping the aspect
       ratio. Without both, the image keeps its own size, unless that is wider
       than the paper */

    if (typeof options.width === 'undefined' || typeof options.height === 'undefined') {
      const size = this.#imageSize(input, type);

      if (!size) {
        throw new Error('Could not determine the size of the image, specify both a width and a height');
      }

      if (typeof options.width !== 'undefined') {
        options.height = Math.max(1, Math.round(options.width * size.height / size.width));
      } else if (typeof options.height !== 'undefined') {
        options.width = Math.max(1, Math.round(options.height * size.width / size.height));
      } else if (size.width > this.printableWidth) {
        options.width = this.printableWidth;
        options.height = Math.max(1, Math.round(this.printableWidth * size.height / size.width));
      } else {
        options.width = Math.round(size.width);
        options.height = Math.round(size.height);
      }
    }

    width = options.width;
    height = options.height;

    /* The printer needs the width and height to be a multiple of 8 dots, the
       image is padded with white dots on the right and at the bottom */

    const paddedWidth = Math.ceil(width / 8) * 8;
    const paddedHeight = Math.ceil(height / 8) * 8;

    algorithm = options.algorithm;
    threshold = options.threshold;

    /* Turn provided data into an ImageData object */

    let image;

    if (type == 'element') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(input, 0, 0, width, height);
      image = context.getImageData(0, 0, width, height);
    }

    if (type == 'node-canvas') {
      const context = input.getContext('2d');
      image = context.getImageData(0, 0, input.width, input.height);
    }

    if (type == 'node-canvas-image') {
      if (typeof this.#options.createCanvas !== 'function') {
        throw new Error('Canvas is not supported in this environment, specify a createCanvas function in the options');
      }

      const canvas = this.#options.createCanvas(width, height);
      const context = canvas.getContext('2d');
      context.drawImage(input, 0, 0, width, height);
      image = context.getImageData(0, 0, width, height);
    }

    if (type == 'node-read-image') {
      image = new ImageData(input.width, input.height);
      image.data.set(input.frames[0].data);
    }

    if (type == 'node-sharp') {
      image = new ImageData(input.info.width, input.info.height);
      image.data.set(input.data);
    }

    if (type == 'ndarray') {
      image = new ImageData(input.shape[0], input.shape[1]);
      image.data.set(input.data);
    }

    if (type == 'object') {
      image = new ImageData(input.width, input.height);
      image.data.set(input.data);
    }

    if (type == 'imagedata') {
      image = input;
    }

    if (!image) {
      throw new Error('Image could not be loaded');
    }

    /* Resize image */

    if (width !== image.width || height !== image.height) {
      image = resizeImageData(image, width, height, 'bilinear-interpolation');
    }

    /* Check if the image has the correct dimensions */

    if (width !== image.width || height !== image.height) {
      throw new Error('Image could not be resized');
    }

    /* Flatten the image and dither it */

    image = Flatten.flatten(image, [0xff, 0xff, 0xff]);

    switch (algorithm) {
      case 'threshold': image = Dither.threshold(image, threshold); break;
      case 'bayer': image = Dither.bayer(image, threshold); break;
      case 'floydsteinberg': image = Dither.floydsteinberg(image); break;
      case 'atkinson': image = Dither.atkinson(image); break;
    }

    /* Pad the image to a multiple of 8 dots */

    if (paddedWidth !== width || paddedHeight !== height) {
      const padded = new ImageData(paddedWidth, paddedHeight);
      padded.data.fill(255);

      for (let y = 0; y < height; y++) {
        padded.data.set(image.data.subarray(y * width * 4, (y + 1) * width * 4), y * paddedWidth * 4);
      }

      image = padded;
    }

    /* Encode the image data */

    this.#block(
        this.#language.image(image, paddedWidth, paddedHeight, options.mode, this.#printerResolution),
    );

    return this;
  }

  /**
     * Determine the size of an image input in pixels
     *
     * @param  {ImageInput}  input   The image input
     * @param  {string}      type    The type of the input, as determined by image()
     * @return {{width: number, height: number}|null}   The size, or null if it cannot be determined
     */
  #imageSize(input, type) {
    let width;
    let height;

    if (type === 'element') {
      width = input.naturalWidth || input.videoWidth || input.width;
      height = input.naturalHeight || input.videoHeight || input.height;

      /* SVG elements have animated lengths instead of numbers */

      if (typeof width === 'object' && width !== null && width.baseVal) {
        width = width.baseVal.value;
      }

      if (typeof height === 'object' && height !== null && height.baseVal) {
        height = height.baseVal.value;
      }
    } else if (type === 'node-sharp') {
      width = input.info.width;
      height = input.info.height;
    } else if (type === 'ndarray') {
      width = input.shape[0];
      height = input.shape[1];
    } else {
      width = input.width;
      height = input.height;
    }

    width = Number(width);
    height = Number(height);

    if (!(width > 0) || !(height > 0)) {
      return null;
    }

    return {width, height};
  }

  /**
     * Cut paper
     *
     * @param  {CutType}          [value]   full or partial. When not specified a full cut will be assumed
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  cut(value) {
    if (this.#options.embedded) {
      throw new Error('Cut is not supported in table cells or boxes');
    }

    for (let i = 0; i < this.#options.feedBeforeCut; i++) {
      this.#composer.flush({forceNewline: true});
    }

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    this.#composer.add(
        this.#language.cut(value),
    );

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    return this;
  }

  /**
     * Pulse
     *
     * @param  {number}          [device]  0 or 1 for on which pin the device is connected, default of 0
     * @param  {number}          [on]      Time the pulse is on in milliseconds, default of 100 on ESC/POS, 200 on StarPRNT
     * @param  {number}          [off]     Time the pulse is off in milliseconds, default of 500 on ESC/POS, 200 on StarPRNT
     * @return {ReceiptPrinterEncoder}                  Return the object, for easy chaining commands
     *
     */
  pulse(device, on, off) {
    if (this.#options.embedded) {
      throw new Error('Pulse is not supported in table cells or boxes');
    }

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    this.#composer.add(
        this.#language.pulse(device, on, off),
    );

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    return this;
  }

  /**
     * Add raw printer commands
     *
     * @param  {number[]|Uint8Array}           data   raw bytes to be included
     * @return {ReceiptPrinterEncoder}          Return the object, for easy chaining commands
     *
     */
  raw(data) {
    this.#composer.raw(data);

    return this;
  }

  /**
   * Internal function for encoding style changes
   * @param  {string}          property  The property that needs to be changed
   * @param  {boolean}         value     Is the property enabled or disabled
   * @return {array}                     Return the encoded bytes
   */
  #encodeStyle(property, value) {
    if (property === 'bold') {
      return this.#language.bold(value);
    }

    if (property === 'underline') {
      return this.#language.underline(value);
    }

    if (property === 'italic') {
      return this.#language.italic(value);
    }

    if (property === 'invert') {
      return this.#language.invert(value);
    }

    if (property === 'size') {
      return this.#language.size(value.width, value.height);
    }
  }

  /**
   * Internal function for encoding text in the correct codepage
   * @param  {string}          value  The text that needs to be encoded
   * @param  {string}          codepage  The codepage that needs to be used
   * @return {array}                   Return the encoded bytes
   */
  #encodeText(value, codepage) {
    if (codepage === null) {
      const fragment = CodepageEncoder.encode(value, 'ascii');

      return [
        {type: 'text', payload: [...fragment]},
      ];
    }

    if (codepage !== 'auto') {
      const fragment = CodepageEncoder.encode(value, codepage);

      if (this.#state.codepage != this.#codepageMapping[codepage]) {
        this.#state.codepage = this.#codepageMapping[codepage];

        return [
          {type: 'codepage', payload: this.#language.codepage(this.#codepageMapping[codepage])},
          {type: 'text', payload: [...fragment]},
        ];
      }

      return [
        {type: 'text', payload: [...fragment]},
      ];
    }

    const fragments = CodepageEncoder.autoEncode(value, this.#codepageCandidates);
    const buffer = [];

    for (const fragment of fragments) {
      if (this.#state.codepage != this.#codepageMapping[fragment.codepage]) {
        this.#state.codepage = this.#codepageMapping[fragment.codepage];

        buffer.push(
            {type: 'codepage', payload: this.#language.codepage(this.#codepageMapping[fragment.codepage])},
        );
      }

      buffer.push(
          {type: 'text', payload: [...fragment.bytes]},
      );
    }

    return buffer;
  }

  /**
   * Get all the commands
   *
   * @return {{ commands: object[], height: number }[]}         All the commands currently in the queue
   */
  commands() {
    let requiresFlush = true;

    /* Determine if the last command is a pulse or cut, the we do not need a flush */

    const lastLine = this.#queue[this.#queue.length - 1];

    if (lastLine) {
      const lastCommand = lastLine[lastLine.length - 1];

      if (lastCommand && ['pulse', 'cut'].includes(lastCommand.type)) {
        requiresFlush = false;
      }
    }

    /* Flush the printer line buffer if needed */

    if (requiresFlush && this.#options.autoFlush && !this.#options.embedded) {
      this.#composer.add(
          this.#language.flush(),
      );
    }

    /* Get the remaining from the composer */

    const result = [];

    const remaining = this.#composer.fetch({forceFlush: true, ignoreAlignment: true});

    if (remaining.length) {
      this.#queue.push(remaining);
    }

    /* Process all lines in the queue */

    while (this.#queue.length) {
      const line = this.#queue.shift();
      const height = line
          .filter((i) => i.type === 'style' && i.property === 'size')
          .map((i) => i.value.height)
          .reduce((a, b) => Math.max(a, b), 1);

      if (this.#options.debug) {
        console.log('|' + line.filter((i) => i.type === 'text').map((i) => i.value).join('') + '|', height);
      }

      result.push({
        commands: line,
        height: height,
      });
    }

    if (this.#options.debug) {
      console.log('commands', result);
    }

    this.#reset();

    return result;
  }

  // eslint-disable-next-line valid-jsdoc
  /**
     * Encode all previous commands
     *
     * @overload
     * @param {'commands'} format
     * @return {{ commands: object[], height: number }[]}
     */
  // eslint-disable-next-line valid-jsdoc
  /**
     * @overload
     * @param {'lines'} format
     * @return {object[][]}
     */
  // eslint-disable-next-line valid-jsdoc
  /**
     * @overload
     * @param {string} [format]
     * @return {Uint8Array}
     */
  // eslint-disable-next-line valid-jsdoc
  /**
     * @param {string} [format]  The format of the output, either 'commands',
     *                           'lines' or 'array', defaults to 'array'
     * @return {Uint8Array|{ commands: object[], height: number }[]|object[][]}
     */
  encode(format) {
    /* Get the commands */

    const commands = this.commands();

    if (format === 'commands') {
      return commands;
    }

    /* Build the lines */

    const lines = [];

    for (const line of commands) {
      const buffer = [];

      for (const item of line.commands) {
        if (item.type === 'text') {
          buffer.push(...this.#encodeText(item.value, item.codepage));
        } else if (item.type === 'style') {
          buffer.push(Object.assign(item, {payload: this.#encodeStyle(item.property, item.value)}));
        } else if (item.type === 'raw') {
          /* Raw bytes may have changed the code page of the printer, so the
             next text sends the code page command again */

          this.#state.codepage = -1;
          buffer.push(item);
        } else if (item.value || item.payload) {
          buffer.push(item);
        }
      }

      lines.push(buffer);
    }

    if (format === 'lines') {
      return lines;
    }

    /* Build the array */

    let result = [];
    let last = null;

    for (let i = 0; i < lines.length; i++) {
      for (const item of lines[i]) {
        result.push(...item.payload);
        last = item;
      }

      /* Only feed the paper when the line contains printable content, a line
         consisting of nothing but state changes, such as style, font or alignment
         commands, would otherwise be printed as an empty line */

      if (!LineComposer.hasContent(commands[i].commands)) {
        continue;
      }

      /* Images, barcodes and QR codes advance the paper by themselves, the
         line feed after them can be disabled with the feedAfterBlock option */

      if (!this.#options.feedAfterBlock && LineComposer.isBlock(commands[i].commands)) {
        continue;
      }

      if (this.#options.newline === '\n\r') {
        result.push(0x0a, 0x0d);
      }

      if (this.#options.newline === '\n') {
        result.push(0x0a);
      }
    }

    /* If the last command is a pulse, do not feed */

    if (last && last.type === 'pulse') {
      result = result.slice(0, 0 - this.#options.newline.length);
    }

    return Uint8Array.from(result);
  }

  /**
   * Throw an error
   *
   * @param  {string}          message  The error message
   * @param  {string}          level    The error level, if level is strict,
   *                                    an error will be thrown, if level is relaxed,
   *                                    a warning will be logged
   * @return {ReceiptPrinterEncoder}          Return the object, for easy chaining commands
   */
  #error(message, level) {
    if (level === 'strict' || this.#options.errors === 'strict') {
      throw new Error(message);
    }

    console.warn(message);

    return this;
  }

  /**
   * Get all supported printer models
   *
   * @return {PrinterModelInfo[]}         An object with all supported printer models
   */
  static get printerModels() {
    return Object.entries(printerDefinitions).map((i) => ({id: i[0], name: i[1].vendor + ' ' + i[1].model}));
  }

  /**
   * Get the current column width
   *
   * @return {number}         The column width in characters
   */
  get columns() {
    return this.#composer.columns;
  }

  /**
   * Get the width of the print area in dots, based on the number of columns
   * and the width of font A, rounded down to a multiple of 8. Use it to size
   * images and to know how wide the paper is
   *
   * @return {number}         The width of the print area in dots
   */
  get printableWidth() {
    const dots = parseInt(this.#printerCapabilities.fonts['A']?.size, 10) || 12;

    return Math.floor((this.#options.columns * dots) / 8) * 8;
  }

  /**
   * Get the current language
   * @return {string}         The language that is currently used
   */
  get language() {
    return this.#options.language;
  }

  /**
   * Get the capabilities of the printer
   * @return {object}         The capabilities of the printer
   */
  get printerCapabilities() {
    return this.#printerCapabilities;
  }
}

export { ReceiptPrinterEncoder as default };
