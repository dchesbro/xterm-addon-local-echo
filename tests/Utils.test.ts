import {
  getColRow,
  getLineCount,
  getSharedFragment,
  getTabSuggestions,
  getWord,
  hasIncompleteChars,
} from "../src/Utils";

/**
 * Test closest left boundary
 */
test("closestLeftBoundary()", () => {
  expect(getWord("foo bar baz", 5, true)).toEqual(4);
  expect(getWord("foo bar baz", 2, true)).toEqual(0);
  expect(getWord("foo bar baz", 0, true)).toEqual(0);
});

/**
 * Test closest right boundary
 */
test("closestRightBoundary()", () => {
  expect(getWord("foo bar baz", 5, false)).toEqual(7);
  expect(getWord("foo bar baz", 2, false)).toEqual(3);
  expect(getWord("foo bar baz", 11, false)).toEqual(11);
});

/**
 * Test offset to row/col de-composition
 */
test("getColRow()", () => {
  const colSize = 25;

  expect(getColRow("test single line case", 0, colSize)).toEqual({
    row: 0,
    col: 0,
  });
  expect(getColRow("test single line case", 10, colSize)).toEqual({
    row: 0,
    col: 10,
  });
  expect(getColRow("test single line case that wraps", 25, colSize)).toEqual({
    row: 0,
    col: 25,
  });
  expect(getColRow("test single line case that wraps", 26, colSize)).toEqual({
    row: 1,
    col: 0,
  });

  expect(getColRow("test\nmulti\nline case\n", 4, colSize)).toEqual({
    row: 0,
    col: 4,
  });
  expect(getColRow("test\nmulti\nline case\n", 5, colSize)).toEqual({
    row: 1,
    col: 0,
  });
  expect(getColRow("test\nmulti\nline case\n", 6, colSize)).toEqual({
    row: 1,
    col: 1,
  });

  expect(getColRow(
    "test multiple lines that wraps and\nalso\nnew\nlines",
    25,
    colSize
  )).toEqual({
    row: 0,
    col: 25,
  });
  expect(getColRow(
    "test multiple lines that wraps and\nalso\nnew\nlines",
    26,
    colSize
  )).toEqual({
    row: 1,
    col: 0,
  });
  expect(getColRow(
    "test multiple lines that wraps and\nalso\nnew\nlines",
    35,
    colSize
  )).toEqual({
    row: 2,
    col: 0,
  });
});

test("getLineCount()", () => {
  expect(getLineCount("abcdef", 10)).toBe(1);
  expect(getLineCount("abcdef", 6)).toBe(1);
  expect(getLineCount("abcdef", 5)).toBe(2);
  expect(getLineCount("abcdef", 3)).toBe(2);
  expect(getLineCount("abcdef", 2)).toBe(3);

  expect(getLineCount(" ".repeat(6) + "a", 10)).toBe(1);
  // |123456a|

  expect(getLineCount(" ".repeat(6) + "a", 5)).toBe(2);
  // |12345|
  // |6a|

  // TODO: consider, expected 3, received 2
  // expect(countLines("      a", 3)).toBe(3);
  // |123|
  // |456|
  // |a|

  const ansiColor = {
    red: "\u001b[31m",
    blue: "\u001b[34m",

    reset: "\u001b[0m",
  };

  const input = `default ${ansiColor.red}red_text ${ansiColor.blue}blue_text ${ansiColor.reset}default`;
  const inputWithoutColor = `default red_text blue_text default`;
  expect(getLineCount(input, 100)).toBe(1);
  expect(getLineCount(input, 10)).toBe(Math.ceil(inputWithoutColor.length / 10));
});

/**
 * Tests if isIncompleteInput correctly detects various cases
 */
test("isIncompleteInput()", () => {
  // Empty input is considered completed
  expect(hasIncompleteChars("")).toEqual(false);
  expect(hasIncompleteChars("   ")).toEqual(false);

  // Normal cases
  expect(hasIncompleteChars("some foo bar")).toEqual(false);
  expect(hasIncompleteChars(`some "double quotes"`)).toEqual(false);
  expect(hasIncompleteChars(`some 'single quotes'`)).toEqual(false);
  expect(hasIncompleteChars(`some 'single "double" quotes'`)).toEqual(false);
  expect(hasIncompleteChars(`some && command`)).toEqual(false);

  // Incomplete boolean ops
  expect(hasIncompleteChars(`some &&`)).toEqual(true);
  expect(hasIncompleteChars(`some &&    `)).toEqual(true);
  expect(hasIncompleteChars(`some ||`)).toEqual(true);
  expect(hasIncompleteChars(`some ||    `)).toEqual(true);
  expect(hasIncompleteChars(`some && foo ||`)).toEqual(true);
  expect(hasIncompleteChars(`some && foo || &&`)).toEqual(true);

  // Incomplete pipe
  expect(hasIncompleteChars(`some |`)).toEqual(true);
  expect(hasIncompleteChars(`some | `)).toEqual(true);

  // Incomplete quote
  expect(hasIncompleteChars(`some "command that continues`)).toEqual(true);
  expect(hasIncompleteChars(`some "`)).toEqual(true);
  expect(hasIncompleteChars(`some "  `)).toEqual(true);
  expect(hasIncompleteChars(`some 'same thing with single`)).toEqual(true);
  expect(hasIncompleteChars(`some '`)).toEqual(true);
  expect(hasIncompleteChars(`some '   `)).toEqual(true);
});

/**
 * Tests if isIncompleteInput correctly detects various cases
 */
test("getTabSuggestions()", () => {
  const allCb = () => {
    return ["a", "ab", "abc"];
  };

  const firstCb = (index: number) => {
    if (index === 1) return ["b", "bc", "bcd"];
    return [];
  };

  const customCb = (index: number, tokens: any, custom: any) => {
    return custom;
  };

  const cbList = [
    { fn: allCb, args: [] },
    { fn: firstCb, args: [] },
    {
      fn: customCb,
      args: [["c", "cd", "cde"]],
    },
  ];

  expect(getTabSuggestions(cbList, "")).toEqual([
    "a",
    "ab",
    "abc",
    "c",
    "cd",
    "cde",
  ]);
  expect(getTabSuggestions(cbList, "a")).toEqual([
    "a",
    "ab",
    "abc",
  ]);
  expect(getTabSuggestions(cbList, "ab")).toEqual(["ab", "abc"]);

  expect(getTabSuggestions(cbList, "ab ")).toEqual([
    "a",
    "ab",
    "abc",
    "b",
    "bc",
    "bcd",
    "c",
    "cd",
    "cde",
  ]);
  expect(getTabSuggestions(cbList, "ab b")).toEqual([
    "b",
    "bc",
    "bcd",
  ]);
});

test("getSharedFragement", () => {
  expect(getSharedFragment("a", ["foo-1", "foo-2"])).toEqual(null);
  expect(getSharedFragment("f", ["foo-1", "foo-2", "a"])).toEqual(null);

  expect(getSharedFragment("f", ["foo-1", "foo-2"])).toEqual("foo-");
  expect(getSharedFragment("foo", ["foo-1", "foo-2"])).toEqual("foo-");

  expect(getSharedFragment("f", ["foo-1", "foo-2", "fuu"])).toEqual("f");

  expect(getSharedFragment("foo", ["foo-", "foo-1"])).toEqual("foo-");
  expect(getSharedFragment("foo", ["foo-1", "foo-"])).toEqual("foo-");
});
