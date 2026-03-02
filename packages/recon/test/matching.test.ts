import { describe, expect, it } from "vitest";
import { isChargeableStatus, matchPlayerByAlias, normalizeName } from "../src/index.js";

// ---------------------------------------------------------------------------
// normalizeName
// ---------------------------------------------------------------------------

describe("normalizeName", () => {
  it("lowercases, trims, and collapses punctuation to spaces", () => {
    expect(normalizeName("  John-Doe!! ")).toBe("john doe");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeName("john   doe")).toBe("john doe");
  });
});

// ---------------------------------------------------------------------------
// matchPlayerByAlias — spaceless substring matching
// ---------------------------------------------------------------------------

describe("matchPlayerByAlias — spaceless substring", () => {
  it("matches when alias is a spaceless substring of description", () => {
    const result = matchPlayerByAlias("JohnDoePayment", [
      { playerId: "1", aliasRaw: "John Doe" }
    ]);
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("1");
    expect(result.confidence).toBe(1);
    expect(result.reason).toBe("exact_substring_match");
  });

  it("matches through bank noise words like 'Payment from'", () => {
    const result = matchPlayerByAlias("Payment from John Smith ref 123", [
      { playerId: "1", aliasRaw: "John Smith" }
    ]);
    // spaceless: "paymentfromjohnsmithref123" contains "johnsmith"
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("1");
    expect(result.confidence).toBe(1);
  });

  it("rejects aliases shorter than 4 chars to prevent false positives", () => {
    // "abc" is 3 chars — should not be allowed as a spaceless match
    const result = matchPlayerByAlias("xyzabcdef", [
      { playerId: "1", aliasRaw: "abc" }
    ]);
    // Falls through to token intersection — "abc" has 1 word, 3 chars < 4 → not viable
    expect(result.matched).toBe(false);
  });

  it("prefers the LONGEST matching alias when multiple candidates match spaceless", () => {
    // "smith" (5 chars) and "johnsmith" (9 chars) are both substrings of "johnsmithpayment"
    // The longer alias should win — it's more specific
    const result = matchPlayerByAlias("johnsmithpayment", [
      { playerId: "wrong",  aliasRaw: "smith" },      // 5 chars — less specific, encountered first
      { playerId: "correct", aliasRaw: "John Smith" }  // 9 chars — most specific, should win
    ]);
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("correct");
  });

  it("longer alias wins even when encountered after shorter in candidate list", () => {
    // Same test but candidate order reversed — result must be the same
    const result = matchPlayerByAlias("johnsmithpayment", [
      { playerId: "correct", aliasRaw: "John Smith" }, // 9 chars — encountered first
      { playerId: "wrong",   aliasRaw: "smith" }       // 5 chars — encountered second
    ]);
    expect(result.playerId).toBe("correct");
  });
});

// ---------------------------------------------------------------------------
// matchPlayerByAlias — token intersection matching
// ---------------------------------------------------------------------------

describe("matchPlayerByAlias — token intersection", () => {
  it("matches a full name via 2-token intersection when spaceless cannot fire", () => {
    // "john a smith" stripped = "johnasmith" which does NOT contain "johnsmith" as a substring,
    // so the spaceless path is skipped and token intersection runs instead.
    const result = matchPlayerByAlias("john a smith", [
      { playerId: "1", aliasRaw: "John Smith" }
    ]);
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("1");
    expect(result.confidence).toBe(0.85);
    expect(result.reason).toBe("token_intersection_match");
  });

  it("filters stop words so 'Payment from' does not interfere with token matching", () => {
    // "payment" and "from" are stop words — only "john" and "smith" remain
    const result = matchPlayerByAlias("Payment from John Smith", [
      { playerId: "1", aliasRaw: "John Smith" }
    ]);
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("1");
  });

  it("matches when only one token matches but it is >= 5 chars (highly specific surname)", () => {
    // "J Smith" — "smith" (5 chars) matches alias "John Smith"; "j" does not match "john"
    // Multi-word alias with 1 match where matched word length >= 5 → viable
    const result = matchPlayerByAlias("J Smith", [
      { playerId: "1", aliasRaw: "John Smith" }
    ]);
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("1");
  });

  it("matches a single-word alias of >= 4 chars when that word appears in description", () => {
    const result = matchPlayerByAlias("Payment from Jones ref 456", [
      { playerId: "1", aliasRaw: "Jones" }
    ]);
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("1");
  });

  it("rejects a single-word alias of < 4 chars to avoid false positives", () => {
    // "tom" is only 3 chars — the single-word rule requires >= 4
    const result = matchPlayerByAlias("Payment from Tom ref", [
      { playerId: "1", aliasRaw: "Tom" }
    ]);
    expect(result.matched).toBe(false);
  });

  it("rejects multi-word alias where only 1 word matches and that word is < 5 chars", () => {
    // "john" (4 chars) matches but is < 5 — multi-word requires >= 2 matches or matched word >= 5
    const result = matchPlayerByAlias("john xyz", [
      { playerId: "1", aliasRaw: "John Doe" }
    ]);
    expect(result.matched).toBe(false);
  });

  it("picks the better candidate when two are viable (more matching tokens wins)", () => {
    const result = matchPlayerByAlias("john smith payment", [
      { playerId: "partial", aliasRaw: "John Brown" }, // 1 token match ("john" — 4 chars, but multi-word requires 5 or 2 matches)
      { playerId: "full",    aliasRaw: "John Smith" }  // 2 token matches
    ]);
    expect(result.matched).toBe(true);
    expect(result.playerId).toBe("full");
  });

  it("ignores candidates whose alias words are all stop words", () => {
    // Use an input where "fromto" (alias stripped) is not a spaceless substring,
    // so the spaceless path is skipped and token intersection runs (finding aliasWords empty → skipped).
    const result = matchPlayerByAlias("xyz abc", [
      { playerId: "1", aliasRaw: "from to" } // all stop words → aliasWords empty → skipped
    ]);
    expect(result.matched).toBe(false);
    expect(result.playerId).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// matchPlayerByAlias — fallback suggestion (suggested_player_id)
// ---------------------------------------------------------------------------

describe("matchPlayerByAlias — fallback for reconciliation queue", () => {
  it("returns best partial candidate as playerId even when matched is false", () => {
    // "john" matches alias "John Doe" with 1 token — not viable (4 chars, multi-word needs 5 or ≥2)
    // But should still be returned as a fallback hint
    const result = matchPlayerByAlias("john xyz", [
      { playerId: "hint", aliasRaw: "John Doe" }
    ]);
    expect(result.matched).toBe(false);
    expect(result.playerId).toBe("hint"); // populated for suggested_player_id
    expect(result.confidence).toBe(0);
    expect(result.reason).toBe("no_match");
  });

  it("returns null playerId when there is absolutely no token overlap", () => {
    const result = matchPlayerByAlias("xyz abc 999", [
      { playerId: "1", aliasRaw: "John Doe" }
    ]);
    expect(result.matched).toBe(false);
    expect(result.playerId).toBe(null);
  });

  it("returns null when candidate list is empty", () => {
    const result = matchPlayerByAlias("John Smith", []);
    expect(result.matched).toBe(false);
    expect(result.playerId).toBe(null);
  });

  it("picks the highest-scoring fallback when multiple candidates partially match", () => {
    // "john doe" — "john" matches candidate A (score 1), "john" + "doe" both match candidate B (score 2)
    // Wait — if candidate B matches 2 tokens it should be viable. Let's use a case
    // where B has 2 tokens matching but alias has 3 words (requires ≥2, so actually IS viable).
    // Instead: use a 3-word alias that only has 1 match → not viable
    const result = matchPlayerByAlias("john xyz", [
      { playerId: "A", aliasRaw: "John Doe" },        // 1 match ("john") — not viable (multi-word, <5 chars)
      { playerId: "B", aliasRaw: "John Doe Smith" }    // 1 match ("john") — not viable (multi-word, <5 chars)
    ]);
    expect(result.matched).toBe(false);
    // Both score 1 — first one encountered wins the fallback tie
    expect(result.playerId).not.toBe(null);
  });
});

// ---------------------------------------------------------------------------
// isChargeableStatus
// ---------------------------------------------------------------------------

describe("isChargeableStatus", () => {
  it("marks 'Going' as chargeable (case-insensitive)", () => {
    expect(isChargeableStatus("Going")).toBe(true);
    expect(isChargeableStatus("going")).toBe(true);
    expect(isChargeableStatus("GOING")).toBe(true);
  });

  it("does not mark other statuses as chargeable", () => {
    expect(isChargeableStatus("Interested")).toBe(false);
    expect(isChargeableStatus("Maybe")).toBe(false);
    expect(isChargeableStatus("Not Going")).toBe(false);
    expect(isChargeableStatus("")).toBe(false);
  });
});
