import type { PoolClient } from "pg";
import { matchPlayerByAlias, isChargeableStatus, type MatchCandidate } from "@fiveaside/recon";
import { insertLedgerEntry } from "./ledger.js";

type ProcessBankRowInput = {
  externalTxnId?: string;
  postedAtUtc: string;
  amountCents: number;
  descriptionRaw: string;
  sourceRef?: string;
  tagNames?: string[];
  isOutgoing?: boolean;
};

export async function processBankRows(client: PoolClient, rows: ProcessBankRowInput[], candidates: MatchCandidate[]) {
  let posted = 0;
  let queued = 0;

  for (const row of rows) {
    const isOutgoing = row.isOutgoing ?? false;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO bank_transactions (external_txn_id, posted_at_utc, amount_cents, description_raw, source_ref, is_outgoing)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (external_txn_id) DO NOTHING
       RETURNING id`,
      [row.externalTxnId ?? null, row.postedAtUtc, row.amountCents, row.descriptionRaw, row.sourceRef ?? null, isOutgoing]
    );
    if (inserted.rowCount === 0) {
      continue;
    }

    posted += 1;
    const bankTransactionId = inserted.rows[0]!.id;

    // Outgoing transactions skip player matching — go straight to recon queue
    if (isOutgoing) {
      await client.query(
        `INSERT INTO reconciliation_queue (item_type, source_record_id, payload, suggested_player_id, confidence, reason)
         VALUES ('bank_transaction', $1, $2::jsonb, NULL, 0, 'outgoing_transaction')`,
        [bankTransactionId, JSON.stringify(row)]
      );
      queued += 1;
      continue;
    }

    // Tag-first matching: try each tag before falling back to description
    let match = { matched: false, playerId: null as string | null, confidence: 0, reason: "no_match" } as ReturnType<typeof matchPlayerByAlias>;
    if (row.tagNames && row.tagNames.length > 0) {
      for (const tag of row.tagNames) {
        if (!tag || tag.trim().length === 0) continue;
        const tagMatch = matchPlayerByAlias(tag, candidates);
        if (tagMatch.matched) {
          match = tagMatch;
          break;
        }
      }
    }

    // Fall back to description matching if no tag matched
    if (!match.matched) {
      match = matchPlayerByAlias(row.descriptionRaw, candidates);
    }

    if (!match.matched) {
      await client.query(
        `INSERT INTO reconciliation_queue (item_type, source_record_id, payload, suggested_player_id, confidence, reason)
         VALUES ('bank_transaction', $1, $2::jsonb, $3, $4, $5)`,
        [bankTransactionId, JSON.stringify(row), match.playerId, match.confidence, match.reason]
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

  // Rescan bank transactions
  const bankItems = await client.query<{
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

  for (const item of bankItems.rows) {
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

  // Rescan attendance items for this specific player
  const attendanceItems = await client.query<{
    id: string;
    source_record_id: string;
    payload: Record<string, unknown> | null;
  }>(
    `SELECT rq.id, rq.source_record_id, rq.payload
     FROM reconciliation_queue rq
     WHERE rq.item_type = 'attendance' AND rq.status = 'open'
     FOR UPDATE OF rq`
  );

  for (const item of attendanceItems.rows) {
    const payload = item.payload ?? {};
    const playerName = String(payload.playerName ?? "");
    if (!playerName) continue;

    const match = matchPlayerByAlias(playerName, candidates);
    if (!match.matched || match.playerId !== playerId) continue;

    const sourceStatus = String(payload.sourceStatus ?? "unknown");
    const sourceRef = payload.sourceRef ? String(payload.sourceRef) : null;
    const chargeable = isChargeableStatus(sourceStatus);

    const attendance = await client.query<{ id: string }>(
      `INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_id, player_id) DO NOTHING
       RETURNING id`,
      [item.source_record_id, playerId, sourceStatus, chargeable, sourceRef]
    );

    // Only create ledger entry if attendance was newly inserted (not duplicate)
    if (attendance.rowCount !== 0 && chargeable) {
      const game = await client.query<{ fee_cents: number }>(
        `SELECT fee_cents FROM games WHERE id = $1`,
        [item.source_record_id]
      );
      if (game.rowCount !== 0) {
        await insertLedgerEntry(client, {
          playerId,
          type: "charge",
          amountCents: game.rows[0]!.fee_cents,
          gameId: item.source_record_id,
          attendanceId: attendance.rows[0]!.id
        });
      }
    }

    // Always resolve the queue item — attendance either exists or was just created
    await client.query(
      `UPDATE reconciliation_queue 
       SET status = 'resolved', resolved_by = NULL, resolved_at = NOW() 
       WHERE id = $1`,
      [item.id]
    );

    mappedCount++;
  }

  return mappedCount;
}

export async function rescanAllPendingTransactions(client: PoolClient) {
  let transactionsMapped = 0;
  let attendanceMapped = 0;

  const aliases = await client.query<{ player_id: string; alias_raw: string }>(
    `SELECT player_id, alias_raw FROM player_aliases`
  );
  const players = await client.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM players`
  );
  
  if (aliases.rowCount === 0 && players.rowCount === 0) {
    return { transactionsMapped: 0, attendanceMapped: 0 };
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

  // Rescan bank transactions
  const bankItems = await client.query<{
    id: string;
    source_record_id: string;
    description_raw: string;
    amount_cents: number;
    payload: Record<string, unknown> | null;
  }>(
    `SELECT rq.id, rq.source_record_id, bt.description_raw, bt.amount_cents, rq.payload
     FROM reconciliation_queue rq
     JOIN bank_transactions bt ON rq.source_record_id = bt.id
     WHERE rq.item_type = 'bank_transaction' AND rq.status = 'open'
     FOR UPDATE OF rq`
  );

  for (const item of bankItems.rows) {
    // Tag-first matching: try tagNames from stored payload before description
    let match = { matched: false, playerId: null as string | null, confidence: 0, reason: "no_match" } as ReturnType<typeof matchPlayerByAlias>;
    const tagNames = item.payload?.tagNames;
    if (Array.isArray(tagNames)) {
      for (const tag of tagNames) {
        if (!tag || String(tag).trim().length === 0) continue;
        const tagMatch = matchPlayerByAlias(String(tag), candidates);
        if (tagMatch.matched) {
          match = tagMatch;
          break;
        }
      }
    }
    if (!match.matched) {
      match = matchPlayerByAlias(item.description_raw, candidates);
    }

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
      
      transactionsMapped++;
    }
  }

  // Rescan attendance items
  const attendanceItems = await client.query<{
    id: string;
    source_record_id: string;
    payload: Record<string, unknown> | null;
  }>(
    `SELECT rq.id, rq.source_record_id, rq.payload
     FROM reconciliation_queue rq
     WHERE rq.item_type = 'attendance' AND rq.status = 'open'
     FOR UPDATE OF rq`
  );

  for (const item of attendanceItems.rows) {
    const payload = item.payload ?? {};
    const playerName = String(payload.playerName ?? "");
    if (!playerName) continue;

    const match = matchPlayerByAlias(playerName, candidates);
    if (!match.matched || !match.playerId) continue;

    const sourceStatus = String(payload.sourceStatus ?? "unknown");
    const sourceRef = payload.sourceRef ? String(payload.sourceRef) : null;
    const chargeable = isChargeableStatus(sourceStatus);

    const attendance = await client.query<{ id: string }>(
      `INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_id, player_id) DO NOTHING
       RETURNING id`,
      [item.source_record_id, match.playerId, sourceStatus, chargeable, sourceRef]
    );

    // Only create ledger entry if attendance was newly inserted (not duplicate)
    if (attendance.rowCount !== 0 && chargeable) {
      const game = await client.query<{ fee_cents: number }>(
        `SELECT fee_cents FROM games WHERE id = $1`,
        [item.source_record_id]
      );
      if (game.rowCount !== 0) {
        await insertLedgerEntry(client, {
          playerId: match.playerId,
          type: "charge",
          amountCents: game.rows[0]!.fee_cents,
          gameId: item.source_record_id,
          attendanceId: attendance.rows[0]!.id
        });
      }
    }

    // Always resolve the queue item — attendance either exists or was just created
    await client.query(
      `UPDATE reconciliation_queue 
       SET status = 'resolved', resolved_by = NULL, resolved_at = NOW() 
       WHERE id = $1`,
      [item.id]
    );

    attendanceMapped++;
  }

  return { transactionsMapped, attendanceMapped };
}
