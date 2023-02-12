import { parse } from "shell-quote";
import ansiRegex from "./ansi-regex";

/**
 * Get column and row position for defined input and cursor offset.
 * 
 * @param input  Input string
 * @param offset Input cursor offset.
 * @param cols   Maximum number of columns.
 * @returns 
 */
export function getOffsetColRow(input: string, offset: number, cols: number) {
  const before = input.substring(0, offset);

  return {
    col: before.length - (Math.floor(before.length / cols) * cols),
    row: Math.floor(before.length / cols)
  };
}

/**
 * Get nearest word offset w/ respect to defined input and cursor offset.
 * 
 * @param input  Input string.
 * @param offset Input cursor offset.
 * @param rtl    Right to left.
 */
export function getOffsetWord(input: string, offset: number, rtl: boolean) {
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
 * Convert offset at the given input to col/row location
 *
 * This function is not optimized and practically emulates via brute-force
 * the navigation on the terminal, wrapping when they reach the column width.
 */
export function offsetToColRow(input: string, offset: number, maxCols: number) {
  let row = 0,
    col = 0;

  for (let i = 0; i < offset; ++i) {
    const chr = input.charAt(i);
    if (chr === "\n") {
      col = 0;
      row += 1;
    } else {
      col += 1;
      if (col === maxCols) {
        col = 0;
        row += 1;
      }
    }
  }

  return { row, col };
}

/**
 * Counts the lines in the given input
 */
export function countLines(input: string, maxCols: number) {
  return (
    offsetToColRow(input, input.replace(ansiRegex(), "").length, maxCols).row +
    1
  );
}

/**
 * Checks if there is an incomplete input
 *
 * An incomplete input is considered:
 * - An input that contains unterminated single quotes
 * - An input that contains unterminated double quotes
 * - An input that ends with "\"
 * - An input that has an incomplete boolean shell expression (&& and ||)
 * - An incomplete pipe expression (|)
 */
export function isIncompleteInput(input: string) {
  // Empty input is not incomplete
  if (input.trim() == "") {
    return false;
  }

  // Check for dangling single-quote strings
  if ((input.match(/'/g) || []).length % 2 !== 0) {
    return true;
  }
  // Check for dangling double-quote strings
  if ((input.match(/"/g) || []).length % 2 !== 0) {
    return true;
  }
  // Check for dangling boolean or pipe operations
  if (
    input
      .split(/(\|\||\||&&)/g)
      .pop()
      ?.trim() == ""
  ) {
    return true;
  }
  // Check for tailing slash
  if (input.endsWith("\\") && !input.endsWith("\\\\")) {
    return true;
  }

  return false;
}

/**
 * Returns true if the expression ends on a tailing whitespace
 */
export function hasTailingWhitespace(input: string) {
  return input.match(/[^\\][ \t]$/m) != null;
}

/**
 * Returns the last expression in the given input
 */
export function getLastToken(input: string): string {
  // Empty expressions
  if (input.trim() === "") return "";
  if (hasTailingWhitespace(input)) return "";

  // Last token
  const tokens = parse(input) as string[];
  return tokens.pop() || "";
}

/**
 * Returns the auto-complete candidates for the given input
 */
export function collectAutocompleteCandidates(
  callbacks: any[],
  input: string
): string[] {
  const tokens = parse(input);
  let index = tokens.length - 1;
  let expr = (tokens[index] as string) || "";

  // Empty expressions
  if (input.trim() === "") {
    index = 0;
    expr = "";
  } else if (hasTailingWhitespace(input)) {
    // Expressions with danging space
    index += 1;
    expr = "";
  }

  // Collect all auto-complete candidates from the callbacks
  const all = callbacks.reduce((candidates, { fn, args }) => {
    try {
      return candidates.concat(fn(index, tokens, ...args));
    } catch (e) {
      console.error("Auto-complete error:", e);
      return candidates;
    }
  }, []);

  // Filter only the ones starting with the expression
  return all.filter((txt: string) => txt.startsWith(expr));
}

export function getSharedFragment(
  fragment: string,
  candidates: string[]
): string | null {
  // end loop when fragment length = first candidate length
  if (fragment.length >= candidates[0].length) return fragment;

  // save old fragemnt
  const oldFragment = fragment;

  // get new fragment
  fragment += candidates[0].slice(fragment.length, fragment.length + 1);

  for (let i = 0; i < candidates.length; i++) {
    // return null when there's a wrong candidate
    if (!candidates[i].startsWith(oldFragment)) return null;

    if (!candidates[i].startsWith(fragment)) {
      return oldFragment;
    }
  }

  return getSharedFragment(fragment, candidates);
}
