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
  gameId?: string | null; // if set, this payment is directly linked to a specific game
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
 * Pair payments to charges using linked-first + FIFO ordering.
 *
 * 1. First pass: Apply payments that have a direct gameId link to their
 *    matching charges. Any excess from a linked payment flows into the
 *    general FIFO pool.
 * 2. Second pass: Remaining unlinked payment capacity is applied FIFO —
 *    charges sorted by game date ascending, payments by createdAt ascending.
 *
 * Status per charge:
 *   - paid amount >= charge amount → "paid"
 *   - 0 < paid amount < charge amount → "partial"
 *   - paid amount == 0 → "unpaid"
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

  // Track how much has been paid toward each charge (by gameId)
  const paidPerGame = new Map<string, number>();
  for (const c of sortedCharges) {
    paidPerGame.set(c.gameId, 0);
  }

  // ── Pass 1: Apply directly-linked payments to their target charges ──
  // Sort linked payments by createdAt so earlier ones apply first
  const linkedPayments = payments
    .filter((p) => p.gameId && paidPerGame.has(p.gameId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let fifoPool = 0; // excess from linked payments that overflows

  for (const payment of linkedPayments) {
    const gameId = payment.gameId!;
    const charge = sortedCharges.find((c) => c.gameId === gameId);
    if (!charge) {
      // No matching charge — entire amount flows to FIFO pool
      fifoPool += payment.amountCents;
      continue;
    }

    const alreadyPaid = paidPerGame.get(gameId) ?? 0;
    const remaining = charge.amountCents - alreadyPaid;

    if (remaining <= 0) {
      // Charge already fully covered — overflow to FIFO pool
      fifoPool += payment.amountCents;
    } else if (payment.amountCents <= remaining) {
      // Payment fits entirely into this charge
      paidPerGame.set(gameId, alreadyPaid + payment.amountCents);
    } else {
      // Payment exceeds remaining charge — apply what fits, overflow the rest
      paidPerGame.set(gameId, alreadyPaid + remaining);
      fifoPool += payment.amountCents - remaining;
    }
  }

  // ── Pass 2: FIFO with unlinked payments + overflow ──
  // Calculate total unlinked payment capacity
  const unlinkedPayments = payments.filter(
    (p) => !p.gameId || !paidPerGame.has(p.gameId),
  );
  let remainingCapacity =
    unlinkedPayments.reduce((sum, p) => sum + p.amountCents, 0) + fifoPool;

  // Apply FIFO capacity to charges that aren't fully covered yet
  for (const charge of sortedCharges) {
    const alreadyPaid = paidPerGame.get(charge.gameId) ?? 0;
    const shortfall = charge.amountCents - alreadyPaid;

    if (shortfall <= 0) continue; // already fully covered by linked payment

    if (remainingCapacity >= shortfall) {
      paidPerGame.set(charge.gameId, charge.amountCents);
      remainingCapacity -= shortfall;
    } else if (remainingCapacity > 0) {
      paidPerGame.set(charge.gameId, alreadyPaid + remainingCapacity);
      remainingCapacity = 0;
    }
    // else: no capacity left, stays at current paidPerGame value
  }

  // ── Build result pairings ──
  const pairings: PlayerGamePairing[] = sortedCharges.map((charge) => {
    const paidCents = paidPerGame.get(charge.gameId) ?? 0;
    let status: GamePaymentStatus;

    if (paidCents >= charge.amountCents) {
      status = "paid";
    } else if (paidCents > 0) {
      status = "partial";
    } else {
      status = "unpaid";
    }

    return {
      playerId: charge.playerId,
      gameId: charge.gameId,
      chargeCents: charge.amountCents,
      paidCents: Math.min(paidCents, charge.amountCents),
      status,
    };
  });

  return pairings;
}
