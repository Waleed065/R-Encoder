import Dither from 'canvas-dither';
import Flatten from 'canvas-flatten';
import CodepageEncoder from '@point-of-sale/codepage-encoder';
import ImageData from '@canvas/image-data';
import resizeImageData from 'resize-image-data';

/* Import local dependencies */

import LanguageEscPos from './languages/esc-pos.js';
import LanguageStarPrnt from './languages/star-prnt.js';
import LineComposer from './line-composer.js';
import Border from './border.js';
import Markdown from './markdown.js';

/* Import generated data */

import codepageMappings from '../generated/mapping.js';
import printerDefinitions from '../generated/printers.js';


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

    /* Force printing the print buffer and moving to a new line */

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* Barcode */

    this.#composer.add(
        this.#language.barcode(value, symbology, options),
    );

    /* Reset alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

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

    /* Force printing the print buffer and moving to a new line */

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* QR code */

    this.#composer.add(
        this.#language.qrcode(value, options),
    );

    /* Reset alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

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

    /* Force printing the print buffer and moving to a new line */

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* PDF417 code */

    this.#composer.add(
        this.#language.pdf417(value, options),
    );

    /* Reset alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

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

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

    /* Set alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align(this.#composer.align));
    }

    /* Encode the image data */

    this.#composer.add(
        this.#language.image(image, paddedWidth, paddedHeight, this.#options.imageMode, this.#printerResolution),
    );

    /* Reset alignment */

    if (this.#composer.align !== 'left') {
      this.#composer.add(this.#language.align('left'));
    }

    this.#composer.flush({forceFlush: true, ignoreAlignment: true});

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
      this.#state.codepage = this.#codepageMapping[fragment.codepage];
      buffer.push(
          {type: 'codepage', payload: this.#language.codepage(this.#codepageMapping[fragment.codepage])},
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

export default ReceiptPrinterEncoder;
