import CodepageEncoder from '@point-of-sale/codepage-encoder';

/* The eleven shapes a border is drawn with, named after the edge of the box
   or table they sit on: the four corners, the four junctions on an edge, the
   junction in the middle and the two straight lines */

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

    this.#single = Border.#page(codepages, SINGLE);
    this.#double = Border.#page(codepages, DOUBLE);
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
     * @param  {object}     shapes      The glyphs that have to be encoded
     * @return {string|null}            The name of the code page, or null
     */
  static #page(codepages, shapes) {
    if (codepages.includes(DEFAULT_CODEPAGE)) {
      return DEFAULT_CODEPAGE;
    }

    const glyphs = Object.values(shapes).join('');

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
     * Get the glyph and the code page for every shape of a border
     *
     * @param  {string}   style     The style of the border, 'single' or 'double'
     * @param  {string}   [corners] The style of the corners, 'square' or 'rounded'
     * @return {object}             An object with a glyph and a codepage for every shape
     */
  glyphs(style, corners) {
    const straight = style === 'double' ? this.#double : this.#single;

    /* A printer that cannot draw the lines draws the whole border in ASCII */

    if (straight === null) {
      return Object.fromEntries(Object.entries(ASCII)
          .map(([name, glyph]) => [name, {glyph, codepage: this.#fallback}]));
    }

    const rounded = style !== 'double' && corners === 'rounded' && this.#corners !== null;
    const shapes = Object.assign({}, style === 'double' ? DOUBLE : SINGLE, rounded ? ROUNDED : {});

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

export default Border;
