import { describe, expect, it } from "vitest";
import { generateGameDates } from "./dates.js";

describe("generateGameDates", () => {
  it("generates weekly dates", () => {
    const dates = generateGameDates("2026-03-02", "weekly", 4);
    expect(dates).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
      "2026-03-23",
    ]);
  });

  it("generates fortnightly dates", () => {
    const dates = generateGameDates("2026-03-02", "fortnightly", 3);
    expect(dates).toEqual([
      "2026-03-02",
      "2026-03-16",
      "2026-03-30",
    ]);
  });

  it("generates monthly dates", () => {
    const dates = generateGameDates("2026-01-15", "monthly", 4);
    expect(dates).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("clamps month-end dates for monthly frequency", () => {
    const dates = generateGameDates("2026-01-31", "monthly", 3);
    expect(dates[0]).toBe("2026-01-31");
    // Feb doesn't have 31 days — should clamp to Feb 28
    expect(dates[1]).toBe("2026-02-28");
    // March 31 exists
    expect(dates[2]).toBe("2026-03-31");
  });

  it("returns single date for count of 1", () => {
    const dates = generateGameDates("2026-06-01", "weekly", 1);
    expect(dates).toEqual(["2026-06-01"]);
  });

  it("returns empty array for count of 0", () => {
    const dates = generateGameDates("2026-06-01", "weekly", 0);
    expect(dates).toEqual([]);
  });
});
