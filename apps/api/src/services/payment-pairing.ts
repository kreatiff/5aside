/**
 * FIFO Payment-to-Game Pairing Engine
 *
 * Pure-logic module with NO database access.
 * Given arrays of charges and payments for a single player,
 * returns a pairing result showing which games are paid, partial, or unpaid.
 *
 * Algorithm:
 *   1. Sort charges by game date ascending (oldest first)
 *   2. Sort payments by createdAt ascending (oldest first)
 *   3. Walk through charges, consuming payment capacity FIFO
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ChargeEntry = {
  gameId: string;
  attendanceId: string;
  playerId: string;
  amountCents: number;   // positive (the fee owed)
  gameDate: string;       // ISO date string for sorting (e.g. "2026-03-01")
};

export type PaymentEntry = {
  playerId: string;
  amountCents: number;   // positive (abs value of the negative ledger entry)
  createdAt: string;      // ISO datetime string for sorting
};

export type GamePaymentStatus = "paid" | "partial" | "unpaid";

export type PlayerGamePairing = {
  playerId: string;
  gameId: string;
  chargeCents: number;
  paidCents: number;
  status: GamePaymentStatus;
};

// ── Algorithm ──────────────────────────────────────────────────────────────

/**
 * Pair payments to charges using FIFO ordering.
 *
 * Charges are sorted by game date ascending, payments by createdAt ascending.
 * Each charge consumes available payment capacity in order:
 *   - capacity >= charge amount → "paid"
 *   - 0 < capacity < charge amount → "partial"
 *   - capacity == 0 → "unpaid"
 *
 * All entries MUST belong to the same player. If mixed players are passed,
 * the results will be incorrect. Callers must group by player first.
 *
 * @param charges - All charge entries for a single player
 * @param payments - All payment entries for the same player
 * @returns Array of pairings, one per charge, in game-date order
 */
export function pairPaymentsToCharges(
  charges: ChargeEntry[],
  payments: PaymentEntry[],
): PlayerGamePairing[] {
  if (charges.length === 0) return [];

  // Sort charges by game date ascending (oldest charges first)
  const sortedCharges = [...charges].sort((a, b) =>
    a.gameDate.localeCompare(b.gameDate),
  );

  // Sort payments by created_at ascending (oldest payments first)
  const sortedPayments = [...payments].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  // Calculate total available payment capacity
  let remainingCapacity = sortedPayments.reduce(
    (sum, p) => sum + p.amountCents,
    0,
  );

  const pairings: PlayerGamePairing[] = [];

  for (const charge of sortedCharges) {
    if (remainingCapacity >= charge.amountCents) {
      // Fully paid
      pairings.push({
        playerId: charge.playerId,
        gameId: charge.gameId,
        chargeCents: charge.amountCents,
        paidCents: charge.amountCents,
        status: "paid",
      });
      remainingCapacity -= charge.amountCents;
    } else if (remainingCapacity > 0) {
      // Partially paid
      const paidCents = remainingCapacity;
      pairings.push({
        playerId: charge.playerId,
        gameId: charge.gameId,
        chargeCents: charge.amountCents,
        paidCents,
        status: "partial",
      });
      remainingCapacity = 0;
    } else {
      // Unpaid
      pairings.push({
        playerId: charge.playerId,
        gameId: charge.gameId,
        chargeCents: charge.amountCents,
        paidCents: 0,
        status: "unpaid",
      });
    }
  }

  return pairings;
}
