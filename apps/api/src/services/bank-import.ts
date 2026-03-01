import type { PoolClient } from "pg";
import { matchPlayerByAlias, type MatchCandidate } from "@fiveaside/recon";
import { insertLedgerEntry } from "./ledger.js";

type ProcessBankRowInput = {
  externalTxnId?: string;
  postedAtUtc: string;
  amountCents: number;
  descriptionRaw: string;
  sourceRef?: string;
};

export async function processBankRows(client: PoolClient, rows: ProcessBankRowInput[], candidates: MatchCandidate[]) {
  let posted = 0;
  let queued = 0;

  for (const row of rows) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO bank_transactions (external_txn_id, posted_at_utc, amount_cents, description_raw, source_ref)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (external_txn_id) DO NOTHING
       RETURNING id`,
      [row.externalTxnId ?? null, row.postedAtUtc, row.amountCents, row.descriptionRaw, row.sourceRef ?? null]
    );
    if (inserted.rowCount === 0) {
      continue;
    }

    posted += 1;
    const bankTransactionId = inserted.rows[0]!.id;
    const match = matchPlayerByAlias(row.descriptionRaw, candidates);
    if (!match.matched || !match.playerId) {
      await client.query(
        `INSERT INTO reconciliation_queue (item_type, source_record_id, payload, confidence, reason)
         VALUES ('bank_transaction', $1, $2::jsonb, $3, $4)`,
        [bankTransactionId, JSON.stringify(row), match.confidence, match.reason]
      );
      queued += 1;
      continue;
    }

    await insertLedgerEntry(client, {
      playerId: match.playerId,
      type: "payment",
      amountCents: -row.amountCents,
      bankTransactionId
    });
  }

  return { posted, queued };
}
