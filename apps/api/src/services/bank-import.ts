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

export async function rescanPendingTransactionsForPlayer(client: PoolClient, playerId: string) {
  let mappedCount = 0;

  const aliases = await client.query<{ alias_raw: string }>(
    `SELECT alias_raw FROM player_aliases WHERE player_id = $1`,
    [playerId]
  );
  const player = await client.query<{ display_name: string }>(
    `SELECT display_name FROM players WHERE id = $1`,
    [playerId]
  );
  
  if (aliases.rowCount === 0 && player.rowCount === 0) {
    return 0;
  }

  const candidates: MatchCandidate[] = [];
  if ((player.rowCount ?? 0) > 0 && player.rows[0]?.display_name) {
    candidates.push({ playerId, aliasRaw: player.rows[0].display_name });
  }
  for (const row of aliases.rows) {
    if (row.alias_raw) {
      candidates.push({ playerId, aliasRaw: row.alias_raw });
    }
  }

  const queueItems = await client.query<{
    id: string;
    source_record_id: string;
    description_raw: string;
    amount_cents: number;
  }>(
    `SELECT rq.id, rq.source_record_id, bt.description_raw, bt.amount_cents
     FROM reconciliation_queue rq
     JOIN bank_transactions bt ON rq.source_record_id = bt.id
     WHERE rq.item_type = 'bank_transaction' AND rq.status = 'open'
     FOR UPDATE OF rq`
  );

  for (const item of queueItems.rows) {
    const match = matchPlayerByAlias(item.description_raw, candidates);
    if (match.matched && match.playerId === playerId) {
      await insertLedgerEntry(client, {
        playerId,
        type: "payment",
        amountCents: -item.amount_cents,
        bankTransactionId: item.source_record_id
      });

      await client.query(
        `UPDATE reconciliation_queue 
         SET status = 'resolved', resolved_by = NULL, resolved_at = NOW() 
         WHERE id = $1`,
        [item.id]
      );
      
      mappedCount++;
    }
  }

  return mappedCount;
}

export async function rescanAllPendingTransactions(client: PoolClient) {
  let mappedCount = 0;

  const aliases = await client.query<{ player_id: string; alias_raw: string }>(
    `SELECT player_id, alias_raw FROM player_aliases`
  );
  const players = await client.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM players`
  );
  
  if (aliases.rowCount === 0 && players.rowCount === 0) {
    return 0;
  }

  const candidates: MatchCandidate[] = [];
  for (const p of players.rows) {
    if (p.display_name) {
      candidates.push({ playerId: p.id, aliasRaw: p.display_name });
    }
  }
  for (const row of aliases.rows) {
    if (row.alias_raw) {
      candidates.push({ playerId: row.player_id, aliasRaw: row.alias_raw });
    }
  }

  const queueItems = await client.query<{
    id: string;
    source_record_id: string;
    description_raw: string;
    amount_cents: number;
  }>(
    `SELECT rq.id, rq.source_record_id, bt.description_raw, bt.amount_cents
     FROM reconciliation_queue rq
     JOIN bank_transactions bt ON rq.source_record_id = bt.id
     WHERE rq.item_type = 'bank_transaction' AND rq.status = 'open'
     FOR UPDATE OF rq`
  );

  for (const item of queueItems.rows) {
    const match = matchPlayerByAlias(item.description_raw, candidates);
    if (match.matched && match.playerId) {
      await insertLedgerEntry(client, {
        playerId: match.playerId,
        type: "payment",
        amountCents: -item.amount_cents,
        bankTransactionId: item.source_record_id
      });

      await client.query(
        `UPDATE reconciliation_queue 
         SET status = 'resolved', resolved_by = NULL, resolved_at = NOW() 
         WHERE id = $1`,
        [item.id]
      );
      
      mappedCount++;
    }
  }

  return mappedCount;
}
