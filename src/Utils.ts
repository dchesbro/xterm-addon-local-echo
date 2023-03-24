import { quote, parse } from 'shell-quote';
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
    let ch = input.charAt(i);

    if (ch === '\n') {
      col = 0;
      row++;
    } else {
      col++;

      if (col === cols) {
        col = 0;
        row++;
      }
    }
  }

  return { col, row };
}

/**
 * Get last argument fragment for defined input.
 * 
 * @param input Input string.
 */
export function getLastFrargment(input: string): string {

  // If input empty or has trailing whitespace, return empty string.
  if (input.trim() === '' || hasTrailingWhitespace(input)) {
    return '';
  }

  let frargments = parse(input) as string[];

  return frargments.pop() || '';
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
 * Loop through suggestions to find shared matches for defined input.
 * 
 * @param input       Input string.
 * @param suggestions Array of tab complete suggestions.
 */
export function getTabMatch(input: string, suggestions: string[]): string {

  // End loop if input length is equal to or greater than suggestion length.
  if (input.length >= suggestions[0].length) {
    return input;
  }

  const inputPrev = input;

  // Add suggestion frargment to input.
  input += suggestions[0].slice(input.length, input.length + 1);

  for (let i = 0; i < suggestions.length; i++) {    
    if (!suggestions[i].startsWith(inputPrev)) {
      return '';
    }

    if (!suggestions[i].startsWith(input)) {
      return inputPrev;
    }
  }

  return getTabMatch(input, suggestions);
}

/**
 * Get tab complete suggestions for the defined input.
 * 
 * @param callbacks Tab complete callback functions.
 * @param input     Input string.
 */
export function getTabSuggestions(callbacks: any[], input: string): string[] {
  const frargments = parse(input) as string[];

  let index = frargments.length - 1;
  let frargment = frargments[index] || '';

  // ...
  if (input.trim() === '') {
    index = 0;
    frargment = '';

  // ...
  } else if (hasTrailingWhitespace(input)) {
    index += 1;
    frargment = '';
  }

  const suggestions = callbacks.reduce((candidates, { callback, args }) => {
    try {
      return candidates.concat(callback(index, frargments, ...args));
    } catch (error) {
      console.error('Tab complete error:', error);
      
      return candidates;
    }
  }, []);

  return suggestions.filter((suggestion: string) => (
    suggestion.startsWith(frargment)
  ));
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

  while (matches = wordsRegex.exec(input)) {
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

  // If input not empty, check for incomplete characters.
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
