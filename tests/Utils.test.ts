import {
  getColRow,
  getLineCount,
  getTabShared,
  getTabSuggestions,
  getWord,
  hasIncompleteChars,
} from "../src/Utils";

test("getWord(); Right-to-left", () => {
  expect(getWord("foo bar baz", 5, true)).toEqual(4);
  expect(getWord("foo bar baz", 2, true)).toEqual(0);
  expect(getWord("foo bar baz", 0, true)).toEqual(0);
});

test("getWord(); Left-to-right", () => {
  expect(getWord("foo bar baz", 5, false)).toEqual(8);
  expect(getWord("foo bar baz", 2, false)).toEqual(4);
  expect(getWord("foo bar baz", 11, false)).toEqual(11);
});

test("getColRow()", () => {
  const colSize = 25;

  expect(getColRow("test single line case", 0, colSize)).toEqual({
    col: 0,
    row: 0,
  });
  expect(getColRow("test single line case", 10, colSize)).toEqual({
    col: 10,
    row: 0,
  });
  expect(getColRow("test single line case that wraps", 25, colSize)).toEqual({
    col: 0,
    row: 1,
  });
  expect(getColRow("test single line case that wraps", 26, colSize)).toEqual({
    col: 1,
    row: 1,
  });
  expect(getColRow("test\nmulti\nline case\n", 4, colSize)).toEqual({
    col: 4,
    row: 0,
  });
  expect(getColRow("test\nmulti\nline case\n", 5, colSize)).toEqual({
    col: 0,
    row: 1,
  });
  expect(getColRow("test\nmulti\nline case\n", 6, colSize)).toEqual({
    col: 1,
    row: 1,
  });
  expect(getColRow(
    "test multiple lines that wraps and\nalso\nnew\nlines",
    25,
    colSize
  )).toEqual({
    col: 0,
    row: 1,
  });
  expect(getColRow(
    "test multiple lines that wraps and\nalso\nnew\nlines",
    26,
    colSize
  )).toEqual({
    col: 1,
    row: 1,
  });
  expect(getColRow(
    "test multiple lines that wraps and\nalso\nnew\nlines",
    35,
    colSize
  )).toEqual({
    col: 0,
    row: 2,
  });
});

test("getLineCount()", () => {
  expect(getLineCount("abcdef", 10)).toBe(1);
  expect(getLineCount("abcdef", 6)).toBe(2);
  expect(getLineCount("abcdef", 5)).toBe(2);
  expect(getLineCount("abcdef", 3)).toBe(3);
  expect(getLineCount("abcdef", 2)).toBe(4);
  expect(getLineCount(" ".repeat(6) + "a", 10)).toBe(1);
  expect(getLineCount(" ".repeat(6) + "a", 5)).toBe(2);

  const ansiColor = {
    blue: "\u001b[34m",
    red: "\u001b[31m",
    reset: "\u001b[0m",
  };
  const input = `default ${ansiColor.red}red_text ${ansiColor.blue}blue_text ${ansiColor.reset}default`;
  const inputWithoutColor = `default red_text blue_text default`;

  expect(getLineCount(input, 100)).toBe(1);
  expect(getLineCount(input, 10)).toBe(Math.ceil(inputWithoutColor.length / 10));
});

test("isIncompleteInput()", () => {
  expect(hasIncompleteChars("")).toEqual(false);
  expect(hasIncompleteChars("   ")).toEqual(false);
  expect(hasIncompleteChars("some foo bar")).toEqual(false);
  expect(hasIncompleteChars(`some "double quotes"`)).toEqual(false);
  expect(hasIncompleteChars(`some 'single quotes'`)).toEqual(false);
  expect(hasIncompleteChars(`some 'single "double" quotes'`)).toEqual(false);
  expect(hasIncompleteChars(`some && command`)).toEqual(false);
  expect(hasIncompleteChars(`some &&`)).toEqual(true);
  expect(hasIncompleteChars(`some &&    `)).toEqual(true);
  expect(hasIncompleteChars(`some ||`)).toEqual(true);
  expect(hasIncompleteChars(`some ||    `)).toEqual(true);
  expect(hasIncompleteChars(`some && foo ||`)).toEqual(true);
  expect(hasIncompleteChars(`some && foo || &&`)).toEqual(true);
  expect(hasIncompleteChars(`some |`)).toEqual(true);
  expect(hasIncompleteChars(`some | `)).toEqual(true);
  expect(hasIncompleteChars(`some "command that continues`)).toEqual(true);
  expect(hasIncompleteChars(`some "`)).toEqual(true);
  expect(hasIncompleteChars(`some "  `)).toEqual(true);
  expect(hasIncompleteChars(`some 'same thing with single`)).toEqual(true);
  expect(hasIncompleteChars(`some '`)).toEqual(true);
  expect(hasIncompleteChars(`some '   `)).toEqual(true);
});

test("getTabSuggestions()", () => {
  const all = () => {
    return ["a", "ab", "abc"];
  };

  const custom = (index: number, tokens: any, custom: any) => {
    return custom;
  };

  const first = (index: number) => {
    if (index === 1) return ["b", "bc", "bcd"];

    return [];
  };

  const handlers = [
    {
      args: [],
      callback: all,
    },
    {
      args: [["c", "cd", "cde"]],
      callback: custom,
    },
    {
      args: [],
      callback: first,
    },
  ];

  expect(getTabSuggestions(handlers, "")).toEqual([
    "a",
    "ab",
    "abc",
    "c",
    "cd",
    "cde",
  ]);
  expect(getTabSuggestions(handlers, "a")).toEqual([
    "a",
    "ab",
    "abc",
  ]);
  expect(getTabSuggestions(handlers, "ab")).toEqual([
    "ab",
    "abc"
  ]);
  expect(getTabSuggestions(handlers, "ab ")).toEqual([
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
  expect(getTabSuggestions(handlers, "ab b")).toEqual([
    "b",
    "bc",
    "bcd",
  ]);
});

test("getSharedFragement()", () => {
  expect(getTabShared("a", ["foo-1", "foo-2"])).toEqual(null);
  expect(getTabShared("f", ["foo-1", "foo-2", "a"])).toEqual(null);
  expect(getTabShared("f", ["foo-1", "foo-2"])).toEqual("foo-");
  expect(getTabShared("foo", ["foo-1", "foo-2"])).toEqual("foo-");
  expect(getTabShared("f", ["foo-1", "foo-2", "fuu"])).toEqual("f");
  expect(getTabShared("foo", ["foo-", "foo-1"])).toEqual("foo-");
  expect(getTabShared("foo", ["foo-1", "foo-"])).toEqual("foo-");
});
