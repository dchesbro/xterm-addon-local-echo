import { parse, quote } from 'shell-quote';
import ansiRegex from 'ansi-regex';

/**
 * Get column and row position for defined input and cursor offset.
 *
 * @param input  Input string
 * @param offset Input cursor offset.
 * @param cols   Maximum number of columns.
 */
export function getColRow(input: string, offset: number, cols: number) {
  let col = 0;
  let row = 0;

  for (let i = 0; i < offset; i++) {
    const char = input.charAt(i);

    if (char === '\n') {
      col = 0;
      row = row + 1;
    } else {
      col++;

      if (col === cols) {
        col = 0;
        row += row + 1;
      }
    }
  }

  return { col, row };
}

/**
 * Counts the number lines for defined input.
 *
 * @param input Input string.
 * @param cols  Maximum number of columns.
 */
export function getLineCount(input: string, cols: number) {
  return getColRow(input, input.replace(ansiRegex(), '').length, cols).row + 1;
}

/**
 * Loop through suggestions to find part(s) shared w/ defined input.
 *
 * @param input       Input string.
 * @param suggestions Array of tab complete suggestions.
 */
export function getTabShared(input: string, suggestions: string[]): string {
  if (input.length >= suggestions[0].length) {
    return input;
  }

  const inputPrev = input;

  input += suggestions[0].slice(input.length, input.length + 1);

  for (let i = 0; i < suggestions.length; i++) {
    if (!suggestions[i].startsWith(inputPrev)) {
      return '';
    }

    if (!suggestions[i].startsWith(input)) {
      return inputPrev;
    }
  }

  return getTabShared(input, suggestions);
}

/**
 * Get tab complete suggestions for the defined input.
 *
 * @param callbacks Tab complete callback functions.
 * @param input     Input string.
 */
export async function getTabSuggestions(
  callbacks: any[],
  input: string
): Promise<string[]> {
  const args = parse(input) as string[];

  let index = args.length - 1;
  let subject = args[index] || '';

  if (input.trim() === '') {
    index = 0;
    subject = '';
  } else if (hasTrailingWhitespace(input)) {
    index += 1;
    subject = '';
  }

  const suggestions = await callbacks.reduce(
    async (acc, { callback, args }) => {
      try {
        const candidates = await callback(index, subject, ...args);

        return (await acc).concat(candidates);
      } catch (error) {
        console.error('Tab complete error:', error);

        return acc;
      }
    },
    []
  );

  return suggestions.filter((suggestion: string) =>
    suggestion.startsWith(subject)
  );
}

/**
 * Get last argument fragment for defined input.
 *
 * @param input Input string.
 */
export function getTrailingArgument(input: string): string {
  if (input.trim() === '' || hasTrailingWhitespace(input)) {
    return '';
  } else {
    const args = parse(input) as string[];

    return args[args.length - 1] || '';
  }
}

/**
 * Get nearest word w/ respect to defined input and cursor offset.
 *
 * @param input  Input string.
 * @param offset Input cursor offset.
 * @param rtl    Right to left.
 */
export function getWord(input: string, offset: number, rtl: boolean) {
  const words = [];
  const wordsRegex = /\w+/g;

  let found;
  let matches;

  while ((matches = wordsRegex.exec(input))) {
    words.push(matches.index);
  }

  if (rtl) {
    found = words.reverse().find((value) => value < offset) || 0;
  } else {
    found = words.find((value) => value > offset) || input.length;
  }

  return found;
}

/**
 * Check if given input string has incomplete character(s).
 *
 * @param input Input string.
 */
export function hasIncompleteChars(input: string) {
  if (input.trim()) {
    // Has open single quote.
    if ((input.match(/'/g) || []).length % 2 !== 0) {
      return true;
    }

    // Has open double quote.
    if ((input.match(/"/g) || []).length % 2 !== 0) {
      return true;
    }

    // Has boolean or pipe operator.
    let bools = input.split(/(\|\||\||&&)/g);

    if (bools.pop()?.trim() === '') {
      return true;
    }

    // Has trailing slash.
    if (input.endsWith('\\') && !input.endsWith('\\\\')) {
      return true;
    }
  }

  return false;
}

/**
 * Check if defined input string has trailing whitespace.
 *
 * @param input Input string.
 */
export function hasTrailingWhitespace(input: string) {
  return input.match(/[^\\][ \t]$/m) !== null;
}
