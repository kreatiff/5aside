import { describe, it, expect } from "vitest";
import {
  pairPaymentsToCharges,
  type ChargeEntry,
  type PaymentEntry,
} from "./payment-pairing.js";

const makeCharge = (
  gameId: string,
  amountCents: number,
  gameDate: string,
  playerId = "player-1",
): ChargeEntry => ({
  gameId,
  attendanceId: `att-${gameId}`,
  playerId,
  amountCents,
  gameDate,
});

const makePayment = (
  amountCents: number,
  createdAt: string,
  playerId = "player-1",
): PaymentEntry => ({
  playerId,
  amountCents,
  createdAt,
});

describe("pairPaymentsToCharges", () => {
  it("returns empty array when no charges provided", () => {
    const result = pairPaymentsToCharges([], [makePayment(1000, "2026-03-01")]);
    expect(result).toEqual([]);
  });

  it("marks all charges as unpaid when no payments provided", () => {
    const charges = [
      makeCharge("g1", 1000, "2026-03-01"),
      makeCharge("g2", 1000, "2026-03-08"),
    ];
    const result = pairPaymentsToCharges(charges, []);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ gameId: "g1", status: "unpaid", paidCents: 0 });
    expect(result[1]).toMatchObject({ gameId: "g2", status: "unpaid", paidCents: 0 });
  });

  it("marks a single charge as paid with an exact payment", () => {
    const charges = [makeCharge("g1", 1000, "2026-03-01")];
    const payments = [makePayment(1000, "2026-03-02")];
    const result = pairPaymentsToCharges(charges, payments);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      gameId: "g1",
      chargeCents: 1000,
      paidCents: 1000,
      status: "paid",
    });
  });

  it("marks a single charge as partial with insufficient payment", () => {
    const charges = [makeCharge("g1", 1000, "2026-03-01")];
    const payments = [makePayment(500, "2026-03-02")];
    const result = pairPaymentsToCharges(charges, payments);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      gameId: "g1",
      chargeCents: 1000,
      paidCents: 500,
      status: "partial",
    });
  });

  it("covers multiple charges with a single large payment (FIFO)", () => {
    const charges = [
      makeCharge("g1", 1000, "2026-03-01"),
      makeCharge("g2", 1000, "2026-03-08"),
      makeCharge("g3", 1000, "2026-03-15"),
    ];
    const payments = [makePayment(2500, "2026-03-02")];
    const result = pairPaymentsToCharges(charges, payments);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ gameId: "g1", status: "paid", paidCents: 1000 });
    expect(result[1]).toMatchObject({ gameId: "g2", status: "paid", paidCents: 1000 });
    expect(result[2]).toMatchObject({ gameId: "g3", status: "partial", paidCents: 500 });
  });

  it("handles overpayment — all charges paid, excess ignored", () => {
    const charges = [
      makeCharge("g1", 1000, "2026-03-01"),
      makeCharge("g2", 1000, "2026-03-08"),
    ];
    const payments = [makePayment(3000, "2026-03-02")];
    const result = pairPaymentsToCharges(charges, payments);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ gameId: "g1", status: "paid", paidCents: 1000 });
    expect(result[1]).toMatchObject({ gameId: "g2", status: "paid", paidCents: 1000 });
  });

  it("handles multiple smaller payments accumulating across charges", () => {
    const charges = [
      makeCharge("g1", 1000, "2026-03-01"),
      makeCharge("g2", 1000, "2026-03-08"),
    ];
    const payments = [
      makePayment(600, "2026-03-02"),
      makePayment(600, "2026-03-05"),
      makePayment(400, "2026-03-09"),
    ];
    // Total payments = 1600, total charges = 2000
    // g1 (1000): 1600 capacity → paid (capacity drops to 600)
    // g2 (1000): 600 capacity → partial, paidCents=600
    const result = pairPaymentsToCharges(charges, payments);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ gameId: "g1", status: "paid", paidCents: 1000 });
    expect(result[1]).toMatchObject({ gameId: "g2", status: "partial", paidCents: 600 });
  });

  it("sorts charges by game date regardless of input order", () => {
    // Input order is reversed — g2 first, g1 second
    const charges = [
      makeCharge("g2", 1000, "2026-03-08"),
      makeCharge("g1", 500, "2026-03-01"),
    ];
    const payments = [makePayment(500, "2026-03-02")];
    const result = pairPaymentsToCharges(charges, payments);

    // Should pair to g1 first (older game date) then g2
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ gameId: "g1", status: "paid", paidCents: 500 });
    expect(result[1]).toMatchObject({ gameId: "g2", status: "unpaid", paidCents: 0 });
  });

  it("handles charges with different amounts (variable fees)", () => {
    const charges = [
      makeCharge("g1", 1000, "2026-03-01"),
      makeCharge("g2", 1500, "2026-03-08"),
      makeCharge("g3", 1000, "2026-03-15"),
    ];
    // Total = 3500, payment = 2200
    // g1 (1000): paid → capacity 1200
    // g2 (1500): partial (1200/1500) → capacity 0
    // g3 (1000): unpaid
    const payments = [makePayment(2200, "2026-03-02")];
    const result = pairPaymentsToCharges(charges, payments);

    expect(result[0]).toMatchObject({ gameId: "g1", status: "paid", paidCents: 1000 });
    expect(result[1]).toMatchObject({ gameId: "g2", status: "partial", paidCents: 1200 });
    expect(result[2]).toMatchObject({ gameId: "g3", status: "unpaid", paidCents: 0 });
  });

  it("preserves playerId in output", () => {
    const charges = [makeCharge("g1", 1000, "2026-03-01", "player-42")];
    const payments = [makePayment(1000, "2026-03-02", "player-42")];
    const result = pairPaymentsToCharges(charges, payments);

    expect(result[0]!.playerId).toBe("player-42");
  });
});
