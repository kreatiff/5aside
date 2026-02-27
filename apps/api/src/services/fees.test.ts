import { describe, expect, it } from "vitest";
import { canEditGameFee, snapshotFeeForGame } from "./fees.js";

describe("snapshotFeeForGame", () => {
  it("returns the current global fee as the immutable game snapshot", () => {
    expect(snapshotFeeForGame(1000)).toBe(1000);
    expect(snapshotFeeForGame(1500)).toBe(1500);
  });

  it("rejects non-positive or non-integer fees", () => {
    expect(() => snapshotFeeForGame(0)).toThrowError("Invalid global fee");
    expect(() => snapshotFeeForGame(-10)).toThrowError("Invalid global fee");
    expect(() => snapshotFeeForGame(1000.5)).toThrowError("Invalid global fee");
  });
});

describe("canEditGameFee", () => {
  it("allows editing before any charge ledger entries exist", () => {
    expect(canEditGameFee(false)).toBe(true);
  });

  it("locks editing after charge ledger entries exist", () => {
    expect(canEditGameFee(true)).toBe(false);
  });
});
