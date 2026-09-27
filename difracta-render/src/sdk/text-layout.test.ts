import { describe, expect, it } from "vitest";

import {
  balanceLines,
  breakLines,
  layoutText,
  paragraphs,
  rasterSize,
  widestWord,
  type TextMeasure,
} from "./text-layout.ts";

/** Every character half an em wide. */
const measure: TextMeasure = (text) => Array.from(text).length * 0.5;

describe("paragraphs", () => {
  it("splits at line breaks of any kind and tidies the spaces", () => {
    expect(paragraphs("one\r\ntwo\rthree\nfour")).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
    expect(paragraphs("  a   b  ")).toEqual(["a b"]);
  });

  it("keeps an empty line between two, and drops the ones that end the text", () => {
    expect(paragraphs("a\n\nb\n\n")).toEqual(["a", "", "b"]);
    expect(paragraphs("")).toEqual([""]);
  });
});

describe("breakLines", () => {
  it("puts as many words on a line as fit", () => {
    // Five ems hold ten characters.
    expect(breakLines("aaa bbb ccc ddd", 5, measure)).toEqual([
      "aaa bbb",
      "ccc ddd",
    ]);
    expect(breakLines("aaa bbb ccc ddd", 100, measure)).toEqual([
      "aaa bbb ccc ddd",
    ]);
  });

  it("keeps the line breaks typed", () => {
    expect(breakLines("aaa\nbbb ccc", 100, measure)).toEqual([
      "aaa",
      "bbb ccc",
    ]);
    expect(breakLines("a\n\nb", 100, measure)).toEqual(["a", "", "b"]);
  });

  it("breaks inside a word only when it is wider than a line", () => {
    expect(breakLines("aaaaaaaaaa bb", 2, measure)).toEqual([
      "aaaa",
      "aaaa",
      "aa",
      "bb",
    ]);
  });

  it("gives a line at least one character however narrow it is", () => {
    expect(breakLines("abc", 0.1, measure)).toEqual(["a", "b", "c"]);
  });
});

describe("balanceLines", () => {
  it("keeps the number of lines and evens them out", () => {
    // Eight ems hold three of the words, leaving the fourth alone.
    expect(breakLines("aaaa bbbb cccc dddd", 8, measure)).toEqual([
      "aaaa bbbb cccc",
      "dddd",
    ]);
    expect(balanceLines("aaaa bbbb cccc dddd", 8, measure)).toEqual([
      "aaaa bbbb",
      "cccc dddd",
    ]);
  });

  it("leaves one line and typed lines as they are", () => {
    expect(balanceLines("aaaa bbbb", 8, measure)).toEqual(["aaaa bbbb"]);
    expect(balanceLines("aaaa\nbbbb cccc", 8, measure)).toEqual([
      "aaaa",
      "bbbb cccc",
    ]);
  });
});

describe("widestWord", () => {
  it("measures the longest word of any line", () => {
    expect(widestWord("a bbbb\ncc", measure)).toBe(2);
    expect(widestWord("  ", measure)).toBe(0);
  });
});

describe("layoutText", () => {
  const request = {
    width: 400,
    height: 100,
    fixedSize: 20,
    lineHeight: 1,
    measure,
  };

  it("draws Fixed at the size given and wraps at the box", () => {
    // 400 pixels at 20 per em hold 40 characters.
    const layout = layoutText({
      ...request,
      fit: "fixed",
      text: `${"a".repeat(30)} ${"b".repeat(30)}`,
    });
    expect(layout?.size).toBe(20);
    expect(layout?.lines).toEqual(["a".repeat(30), "b".repeat(30)]);
    expect(layout?.width).toBe(300);
    expect(layout?.height).toBe(40);
  });

  it("sizes Fill Width so the widest typed line spans the box", () => {
    const layout = layoutText({
      ...request,
      fit: "width",
      text: "aaaa\naaaaaaaa",
    });
    // Eight characters are four ems, over 400 pixels.
    expect(layout?.size).toBe(100);
    expect(layout?.lines).toEqual(["aaaa", "aaaaaaaa"]);
    expect(layout?.width).toBe(400);
  });

  it("fits one word to the box's height or width, whichever is reached first", () => {
    expect(layoutText({ ...request, fit: "fit", text: "aa" })?.size).toBe(100);
    // Sixteen characters are eight ems: 50 pixels per em spans the width.
    const wide = layoutText({ ...request, fit: "fit", text: "a".repeat(16) });
    expect(wide?.size).toBe(50);
    expect(wide?.lines).toEqual(["a".repeat(16)]);
  });

  it("fits a sentence by wrapping it, never breaking a word", () => {
    const text = "aaaa bbbb cccc dddd";
    // One line of 9.5 ems reaches 42 pixels per em; two lines reach 50, four only 25.
    const wide = layoutText({ ...request, fit: "fit", text });
    expect(wide?.lines).toEqual(["aaaa bbbb", "cccc dddd"]);
    expect(wide?.size).toBeCloseTo(50, 0);
    expect(wide?.width).toBeLessThanOrEqual(400);
    expect(wide?.height).toBeLessThanOrEqual(100);
    // In a square a word per line is the largest: 50 pixels per em again.
    const square = layoutText({
      ...request,
      width: 200,
      height: 200,
      fit: "fit",
      text,
    });
    expect(square?.lines).toEqual(["aaaa", "bbbb", "cccc", "dddd"]);
    expect(square?.size).toBeCloseTo(50, 0);
  });

  it("counts the line height in the block's height", () => {
    const layout = layoutText({
      ...request,
      fit: "fixed",
      lineHeight: 1.5,
      text: "a\nb",
    });
    expect(layout?.height).toBe(60);
  });

  it("lays out nothing without text or without a box", () => {
    expect(
      layoutText({ ...request, fit: "fit", text: " \n " }),
    ).toBeUndefined();
    expect(
      layoutText({ ...request, fit: "fit", text: "a", width: 0 }),
    ).toBeUndefined();
    expect(
      layoutText({ ...request, fit: "fixed", text: "a", fixedSize: 0 }),
    ).toBeUndefined();
  });
});

describe("rasterSize", () => {
  it("is never below the size, and less than a fifth above it", () => {
    for (const size of [3, 10, 17.5, 64, 100, 333, 1000]) {
      expect(rasterSize(size)).toBeGreaterThanOrEqual(size);
      expect(rasterSize(size)).toBeLessThan(size * 1.2 + 1);
    }
  });

  it("changes a few times along a sweep, not at every size", () => {
    const sizes = new Set<number>();
    for (let size = 50; size <= 200; size += 1) sizes.add(rasterSize(size));
    expect(sizes.size).toBeLessThanOrEqual(9);
    expect(rasterSize(64)).toBe(64);
    expect(rasterSize(0)).toBe(0);
  });
});
