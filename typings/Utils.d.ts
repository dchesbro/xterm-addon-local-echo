/**
 * Get column and row position for defined input and cursor offset.
 *
 * @param input  Input string
 * @param offset Input cursor offset.
 * @param cols   Maximum number of columns.
 */
export declare function getColRow(input: string, offset: number, cols: number): {
    col: number;
    row: number;
};
/**
 * Get last argument for defined input.
 *
 * @param input Input string.
 */
export declare function getLastFragment(input: string): string;
/**
 * Counts the number lines for defined input.
 *
 * @param input Input string.
 * @param cols  Maximum number of columns.
 */
export declare function getLineCount(input: string, cols: number): number;
/**
 * Loop through tab suggestions to find best match.
 *
 * @param input       Input string.
 * @param suggestions Array of tab complete suggestions.
 */
export declare function getSharedFragment(input: string, suggestions: string[]): string | null;
/**
 * Get tab complete suggestions for the defined input.
 *
 * @param callbacks Tab complete callback functions.
 * @param input     Input string.
 */
export declare function getTabSuggestions(callbacks: any[], input: string): string[];
/**
 * Get nearest word w/ respect to defined input and cursor offset.
 *
 * @param input  Input string.
 * @param offset Input cursor offset.
 * @param rtl    Right to left.
 */
export declare function getWord(input: string, offset: number, rtl: boolean): number;
/**
 * Check if given input string has incomplete character(s).
 *
 * @param input Input string.
 */
export declare function hasIncompleteChars(input: string): boolean;
/**
 * Check if defined input string has trailing whitespace.
 *
 * @param input Input string.
 */
export declare function hasTailingWhitespace(input: string): boolean;
