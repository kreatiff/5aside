import { describe, expect, it } from "vitest";
import { isChargeableStatus, matchPlayerByAlias, normalizeName } from "../src/index.js";

describe("normalizeName", () => {
  it("normalizes case and punctuation", () => {
    expect(normalizeName("  John-Doe!! ")).toBe("john doe");
  });
});

describe("matchPlayerByAlias", () => {
  it("returns exact match with max confidence", () => {
    const match = matchPlayerByAlias("John Doe", [
      { playerId: "1", aliasNormalized: "john doe" },
      { playerId: "2", aliasNormalized: "alice" }
    ]);
    expect(match.matched).toBe(true);
    expect(match.playerId).toBe("1");
    expect(match.confidence).toBe(1);
  });

  it("returns unmatched when similarity is too low", () => {
    const match = matchPlayerByAlias("John Doe", [{ playerId: "2", aliasNormalized: "alice smith" }]);
    expect(match.matched).toBe(false);
  });
});

describe("isChargeableStatus", () => {
  it("only marks going as chargeable", () => {
    expect(isChargeableStatus("Going")).toBe(true);
    expect(isChargeableStatus("Interested")).toBe(false);
  });
});
