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

export default Markdown;
