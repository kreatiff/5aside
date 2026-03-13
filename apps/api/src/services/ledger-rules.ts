import type { PoolClient } from "pg";
import { insertLedgerEntry } from "./ledger.js";

/**
 * Regex to find [AUTO_PAY_FOR: <uuid>] in player notes.
 */
const AUTO_PAY_REGEX = /\[AUTO_PAY_FOR:\s*([a-fA-F0-9-]{36})\]/;

/**
 * Handles payment processing with automated rules (like the Brothers split).
 * 
 * If the payer has a [AUTO_PAY_FOR: <uuid>] tag in their notes AND the payment 
 * amount is exactly 2x the current game fee, the payment is split 50/50 
 * between the payer and the beneficiary.
 */
export async function processPaymentWithRules(
  client: PoolClient,
  payerId: string,
  amountCents: number,
  bankTransactionId: string
) {
  // 1. Fetch Payer info and Settings
  const [payerRes, settingsRes] = await Promise.all([
    client.query<{ notes: string | null; display_name: string }>(
      `SELECT notes, display_name FROM players WHERE id = $1`,
      [payerId]
    ),
    client.query<{ current_game_fee_cents: number }>(
      `SELECT current_game_fee_cents FROM settings WHERE id = 1`
    )
  ]);

  const payer = payerRes.rows[0];
  const gameFee = settingsRes.rows[0]?.current_game_fee_cents;

  // 2. Evaluate Rule
  const match = payer?.notes?.match(AUTO_PAY_REGEX);
  const beneficiaryId = match ? match[1] : null;

  // Rule: Must have beneficiary AND amount must equal 2x game fee
  // Note: amountCents passed here is expected to be positive (absolute value) 
  // or consistent with how ledger handles it. In bank-import.ts it is positive.
  if (beneficiaryId && gameFee && Math.abs(amountCents) === 2 * gameFee) {
    const splitAmount = Math.abs(amountCents) / 2;
    
    // Check if beneficiary actually exists
    const beneficiaryRes = await client.query<{ display_name: string }>(
      `SELECT display_name FROM players WHERE id = $1`,
      [beneficiaryId]
    );

    if (beneficiaryRes.rowCount > 0) {
      const beneficiaryName = beneficiaryRes.rows[0]?.display_name;

      // Create two ledger entries
      await Promise.all([
        // Payer's half
        insertLedgerEntry(client, {
          playerId: payerId,
          type: "payment",
          amountCents: -splitAmount,
          bankTransactionId,
          adjustmentReason: `Auto-split with ${beneficiaryName}`
        }),
        // Beneficiary's half
        insertLedgerEntry(client, {
          playerId: beneficiaryId,
          type: "payment",
          amountCents: -splitAmount,
          bankTransactionId,
          adjustmentReason: `Auto-transfer from ${payer?.display_name}`
        })
      ]);
      return { split: true, beneficiaryId };
    }
  }

  // Fallback: Standard single-player payment
  await insertLedgerEntry(client, {
    playerId: payerId,
    type: "payment",
    amountCents: -Math.abs(amountCents),
    bankTransactionId
  });

  return { split: false };
}

/**
 * Retroactively applies the split rule to existing payments for a player.
 */
export async function applyRetroactiveSplit(
  client: PoolClient,
  payerId: string,
  recalculateFn: (client: PoolClient, cutoff: string | null) => Promise<void>
) {
  // 1. Fetch Payer and Rule
  const [payerRes, settingsRes] = await Promise.all([
    client.query<{ notes: string | null; display_name: string }>(
      `SELECT notes, display_name FROM players WHERE id = $1`,
      [payerId]
    ),
    client.query<{ current_game_fee_cents: number; cutoff_date: string | null }>(
      `SELECT current_game_fee_cents, cutoff_date FROM settings WHERE id = 1`
    )
  ]);

  const payer = payerRes.rows[0];
  const settings = settingsRes.rows[0];

  if (!payer || !settings) {
    return { appliedCount: 0, error: "Payer or settings not found." };
  }

  const gameFee = settings.current_game_fee_cents;
  const match = payer.notes?.match(AUTO_PAY_REGEX);
  const beneficiaryId = match ? match[1] : null;

  if (!beneficiaryId || !gameFee) {
    return { appliedCount: 0, error: "No valid auto-pay tag found in notes." };
  }

  // 2. Fetch Beneficiary
  const beneficiaryRes = await client.query<{ display_name: string }>(
    `SELECT display_name FROM players WHERE id = $1`,
    [beneficiaryId]
  );
  const beneficiary = beneficiaryRes.rows[0];
  if (!beneficiary) {
    return { appliedCount: 0, error: "Beneficiary player not found." };
  }
  const beneficiaryName = beneficiary.display_name;

  // 3. Find candidate ledger entries
  // Rule: type='payment', adjustment_reason matches the default (null), amount equals 2x fee
  const candidates = await client.query<{ id: string; amount_cents: number; bank_transaction_id: string; created_at: string }>(
    `SELECT id, amount_cents, bank_transaction_id, created_at
     FROM ledger_entries
     WHERE player_id = $1 
       AND type = 'payment'
       AND bank_transaction_id IS NOT NULL
       AND adjustment_reason IS NULL
       AND ABS(amount_cents) = $2`,
    [payerId, 2 * gameFee]
  );

  let appliedCount = 0;
  for (const entry of candidates.rows) {
    const splitAmount = Math.abs(entry.amount_cents) / 2;

    // We do this in the loop so if one fails, we can rollback if needed, 
    // but here we just process atomic chunks.
    await client.query("BEGIN");
    try {
      // Delete old entry (this will subtract from payer balance inside insertLedgerEntry logic, 
      // but we will recalculate at the end anyway for safety)
      await client.query(`DELETE FROM ledger_entries WHERE id = $1`, [entry.id]);

      // Insert two new ones with historical timestamp
      await Promise.all([
        insertLedgerEntry(client, {
          playerId: payerId,
          type: "payment",
          amountCents: -splitAmount,
          bankTransactionId: entry.bank_transaction_id,
          adjustmentReason: `Auto-split with ${beneficiaryName} (Retroactive)`,
          createdAt: entry.created_at
        }),
        insertLedgerEntry(client, {
          playerId: beneficiaryId,
          type: "payment",
          amountCents: -splitAmount,
          bankTransactionId: entry.bank_transaction_id,
          adjustmentReason: `Auto-transfer from ${payer.display_name} (Retroactive)`,
          createdAt: entry.created_at
        })
      ]);
      await client.query("COMMIT");
      appliedCount++;
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`Failed to process retroactive split for entry ${entry.id}`, e);
    }
  }

  // 4. Recalculate all balances to be 100% sure
  await recalculateFn(client, settings.cutoff_date);

  return { appliedCount };
}
