import { afterEach, describe, expect, it, vi } from "vitest";
import { RECENT_SEARCHES_STORAGE_KEY } from "./constants";
import {
  clearStoredRecentSearches,
  getStoredRecentSearches,
  saveStoredRecentSearches,
} from "./recentSearches";

function storeRaw(value: unknown) {
  window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(value));
}

describe("getStoredRecentSearches", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it.each([
    ["an empty string", [""], []],
    ["whitespace only", ["   "], []],
    ["a tab and newline", ["\t\n"], []],
    ["non-string entries", [42, null, true, {}, []], []],
    ["an invalid username", ["not a username"], []],
    ["a username that is too long", ["a".repeat(40)], []],
    ["consecutive hyphens", ["octo--cat"], []],
    ["a leading hyphen", ["-octo"], []],
    ["surrounding whitespace", ["  octo  "], ["octo"]],
    ["mixed valid and junk", ["", "octo", 7, "  ", "torvalds"], ["octo", "torvalds"]],
  ])("drops or repairs %s", (_label, stored, expected) => {
    storeRaw(stored);

    expect(getStoredRecentSearches()).toEqual(expected);
  });

  it("collapses case-insensitive duplicates, keeping the first spelling", () => {
    storeRaw(["Octo", "octo", "OCTO", "torvalds"]);

    expect(getStoredRecentSearches()).toEqual(["Octo", "torvalds"]);
  });

  it("collapses duplicates that differ only by surrounding whitespace", () => {
    storeRaw(["octo", "  octo  "]);

    expect(getStoredRecentSearches()).toEqual(["octo"]);
  });

  it("caps the list after removing junk, not before", () => {
    // Slicing first would let blanks consume slots and return fewer than the cap.
    storeRaw(["", "a", "", "b", "", "c", "", "d", "", "e", "f"]);

    // Capping first would return ["a", "b"] -- the blanks would eat three of the five slots.
    expect(getStoredRecentSearches()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not let collapsed duplicates consume cap slots", () => {
    // Counting duplicates toward the cap is the same defect as counting blanks: the visitor
    // loses a shortcut they earned. The blank case alone does not pin this.
    storeRaw(["Octo", "octo", "a", "b", "c", "d", "e"]);

    expect(getStoredRecentSearches()).toEqual(["Octo", "a", "b", "c", "d"]);
  });

  it("returns an empty list for corrupt JSON", () => {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, "{not json");

    expect(getStoredRecentSearches()).toEqual([]);
  });

  it.each([
    ["an object", { octo: true }],
    ["a bare string", "octo"],
    ["a number", 3],
  ])("returns an empty list when the stored value is %s rather than an array", (_label, stored) => {
    storeRaw(stored);

    expect(getStoredRecentSearches()).toEqual([]);
  });

  it("returns an empty list when nothing is stored", () => {
    expect(getStoredRecentSearches()).toEqual([]);
  });
});

describe("recentSearches helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("returns an empty list when localStorage.getItem throws a plain Error", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(getStoredRecentSearches()).toEqual([]);
  });

  it("swallows plain Error failures when saving recent searches", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => saveStoredRecentSearches(["octo"])).not.toThrow();
  });

  it("swallows plain Error failures when clearing recent searches", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => clearStoredRecentSearches()).not.toThrow();
  });
});
