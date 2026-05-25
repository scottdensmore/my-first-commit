import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredRecentSearches,
  getStoredRecentSearches,
  saveStoredRecentSearches,
} from "./recentSearches";

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
