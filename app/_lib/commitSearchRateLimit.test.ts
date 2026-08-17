import { beforeEach, describe, expect, it } from "vitest";
import {
  COMMIT_SEARCH_RATE_LIMIT_MAX_CLIENTS,
  COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES,
  COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS,
  allowCommitSearch,
  clearCommitSearchRateLimit,
  trackedCommitSearchClientCount,
  trackedCommitSearchClientKeys,
} from "./commitSearchRateLimit";

const CLIENT = "client-key-a";
const OTHER_CLIENT = "client-key-b";
const THIRD_CLIENT = "client-key-c";

/** Runs `count` searches for one client, `intervalMs` apart, and reports every outcome. */
function searchAtInterval(clientKey: string, count: number, intervalMs: number, startedAt = 0) {
  const outcomes: boolean[] = [];
  for (let index = 0; index < count; index += 1) {
    outcomes.push(allowCommitSearch(clientKey, startedAt + index * intervalMs));
  }
  return outcomes;
}

beforeEach(() => {
  clearCommitSearchRateLimit();
});

describe("allowCommitSearch", () => {
  it("allows exactly the limit inside one window and refuses the next search", () => {
    const allowed = searchAtInterval(CLIENT, COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES, 1);

    expect(allowed.every(Boolean)).toBe(true);
    expect(allowCommitSearch(CLIENT, COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES)).toBe(false);
  });

  it("lets the client search again once the window has rolled over", () => {
    searchAtInterval(CLIENT, COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES, 1);
    expect(allowCommitSearch(CLIENT, 100)).toBe(false);

    expect(allowCommitSearch(CLIENT, COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS)).toBe(true);
  });

  it("releases one slot at a time as the oldest search ages out of the rolling window", () => {
    // Two searches at t=0, the rest one second in, so only the first two leave the window
    // when it rolls past t=0.
    allowCommitSearch(CLIENT, 0);
    allowCommitSearch(CLIENT, 0);
    searchAtInterval(CLIENT, COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES - 2, 1, 1_000);

    const justInsideWindow = COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS - 1;
    expect(allowCommitSearch(CLIENT, justInsideWindow)).toBe(false);

    // The two oldest have now aged out, so exactly two more searches fit.
    const windowRolledPast = COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS;
    expect(allowCommitSearch(CLIENT, windowRolledPast)).toBe(true);
    expect(allowCommitSearch(CLIENT, windowRolledPast)).toBe(true);
    expect(allowCommitSearch(CLIENT, windowRolledPast)).toBe(false);
  });

  it("counts each client separately, so one flood cannot block anyone else", () => {
    searchAtInterval(CLIENT, COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES + 50, 1);

    expect(allowCommitSearch(CLIENT, 100)).toBe(false);
    expect(allowCommitSearch(OTHER_CLIENT, 100)).toBe(true);
  });

  it("never refuses a visitor searching at a human pace for half an hour", () => {
    // One search every three seconds, without a pause, for thirty minutes: far past what a
    // person types distinct GitHub handles at, and past any plausible session length.
    const thirtyMinutes = 30 * 60 * 1_000;
    const everyThreeSeconds = 3_000;
    const outcomes = searchAtInterval(CLIENT, thirtyMinutes / everyThreeSeconds, everyThreeSeconds);

    expect(outcomes).toHaveLength(600);
    expect(outcomes.every(Boolean)).toBe(true);
  });

  it("never refuses repeated bursts of recent-search shortcut clicks", () => {
    // Five stored shortcuts clicked in quick succession, then a pause to read the result,
    // repeated for ten minutes.
    const outcomes: boolean[] = [];
    for (let burst = 0; burst < 20; burst += 1) {
      const burstStartedAt = burst * 30_000;
      for (let click = 0; click < 5; click += 1) {
        outcomes.push(allowCommitSearch(CLIENT, burstStartedAt + click * 400));
      }
    }

    expect(outcomes).toHaveLength(100);
    expect(outcomes.every(Boolean)).toBe(true);
  });

  it("bounds the number of tracked clients however many distinct keys arrive", () => {
    for (let index = 0; index < COMMIT_SEARCH_RATE_LIMIT_MAX_CLIENTS * 10; index += 1) {
      allowCommitSearch(`spoofed-${index}`, index);
    }

    expect(trackedCommitSearchClientCount()).toBeLessThanOrEqual(
      COMMIT_SEARCH_RATE_LIMIT_MAX_CLIENTS,
    );
  });

  it("forgets an evicted client rather than blocking it", () => {
    // Eviction under a flood of unfamiliar keys may drop a real client's counter. Forgetting
    // one only refills its allowance; it must never be a way to deny that client service.
    allowCommitSearch(CLIENT, 0);
    for (let index = 0; index < COMMIT_SEARCH_RATE_LIMIT_MAX_CLIENTS * 10; index += 1) {
      allowCommitSearch(`spoofed-${index}`, 1);
    }

    expect(allowCommitSearch(CLIENT, 2)).toBe(true);
  });

  it("drops clients that have gone quiet for longer than the window", () => {
    allowCommitSearch(CLIENT, 0);
    expect(trackedCommitSearchClientCount()).toBe(1);

    allowCommitSearch(OTHER_CLIENT, COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS + 1);

    expect(trackedCommitSearchClientKeys()).toEqual([OTHER_CLIENT]);
  });

  it("drops an idle client sitting behind an active one in eviction order", () => {
    // Eviction order is *not* sorted by last-search time, so dropping idle clients has to look
    // at every entry rather than stopping at the first one still inside the window. A refused
    // search re-inserts its client at the tail without recording a new time -- deliberately, so
    // that being evicted cannot become a reprieve -- which leaves that client behind a newer
    // entry while its own last search is older.
    //
    // This arrangement is what makes an early exit wrong, and it is reachable: CLIENT spends its
    // whole allowance, OTHER_CLIENT searches once a millisecond later, and CLIENT is then refused,
    // which moves it behind OTHER_CLIENT while its own newest search stays the older of the two.
    // Every time below is derived from the limit so the arrangement survives a change to it.
    const startedAt = 1_000;
    const clientLastSearchedAt = startedAt + COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES - 1;

    searchAtInterval(CLIENT, COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES, 1, startedAt);
    allowCommitSearch(OTHER_CLIENT, clientLastSearchedAt + 1);
    expect(allowCommitSearch(CLIENT, clientLastSearchedAt + 2)).toBe(false);
    expect(trackedCommitSearchClientKeys()).toEqual([OTHER_CLIENT, CLIENT]);

    // The one instant where OTHER_CLIENT's search is still inside the window and CLIENT's is not,
    // so the only idle client is the one standing *after* the active one. An eviction pass that
    // stopped at the first client still inside the window would leave CLIENT behind.
    allowCommitSearch(THIRD_CLIENT, clientLastSearchedAt + COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS);

    expect(trackedCommitSearchClientKeys()).toEqual([OTHER_CLIENT, THIRD_CLIENT]);
  });
});
