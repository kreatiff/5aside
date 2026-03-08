import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CsvBankUploadSchema, BankImportSchema, WebhookBankSchema, WebhookAttendanceSchema, WebhookPocketsmithSchema } from "@fiveaside/contracts";
import { parseCsvLines, matchPlayerByAlias, isChargeableStatus, MatchCandidate } from "@fiveaside/recon";
import { parseBody, assertWebhookSecret } from "../utils/request.js";
import { withTransaction, query } from "../db/helpers.js";
import { processBankRows } from "../services/bank-import.js";
import { insertLedgerEntry } from "../services/ledger.js";

/** Convert dd/mm/yyyy or yyyy-mm-dd to ISO datetime string */
function parseCsvDate(raw: string): string {
  const trimmed = raw.trim();
  // Already ISO-ish (yyyy-mm-dd...)
  if (/^\d{4}-/.test(trimmed)) {
    return trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00Z`;
  }
  // dd/mm/yyyy
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}T00:00:00Z`;
  }
  return trimmed;
}

/** Dynamically map CSV columns based on header row */
function mapCsvBankRows(rows: string[][]) {
  if (rows.length === 0) return [];
  const header = rows[0]!.map(c => c.toLowerCase().trim());
  const hasHeader = header.some(h => ['date', 'posted', 'id', 'amount', 'description', 'payee'].includes(h));
  
  let dateIdx = 0, descIdx = 1, amountIdx = 2, idIdx = 3, typeIdx = -1;
  if (hasHeader) {
    if (header.indexOf("date") >= 0) dateIdx = header.indexOf("date");
    else if (header.indexOf("posted") >= 0) dateIdx = header.indexOf("posted");
    
    if (header.indexOf("description") >= 0) descIdx = header.indexOf("description");
    else if (header.indexOf("payee") >= 0) descIdx = header.indexOf("payee");
    
    if (header.indexOf("amount") >= 0) amountIdx = header.indexOf("amount");
    
    if (header.indexOf("id") >= 0) idIdx = header.indexOf("id");
    else if (header.indexOf("transaction id") >= 0) idIdx = header.indexOf("transaction id");

    if (header.indexOf("type") >= 0) typeIdx = header.indexOf("type");
  }

  const sourceRows = hasHeader ? rows.slice(1) : rows;
  return sourceRows
    .filter((row) => row.length > Math.max(dateIdx, descIdx, amountIdx))
    .map((row) => ({
      postedAtUtc: parseCsvDate(row[dateIdx]!),
      descriptionRaw: row[descIdx]! || '',
      amountCents: Math.round(Number(row[amountIdx]) * 100),
      externalTxnId: idIdx >= 0 && row[idIdx] ? row[idIdx] : undefined,
      sourceRef: typeIdx >= 0 && row[typeIdx] ? row[typeIdx] : undefined
    }))
    .filter((mapped) => {
      if (isNaN(mapped.amountCents)) return false;
      if (mapped.amountCents === 0) return false; // zero = no-op; skip
      return true;
    })
    .map((mapped) => {
      // Negative amounts are outgoing payments (venue fees, equipment, etc.)
      if (mapped.amountCents < 0) {
        return { ...mapped, amountCents: Math.abs(mapped.amountCents), isOutgoing: true };
      }
      return { ...mapped, isOutgoing: false };
    });
}

export async function importRoutes(app: FastifyInstance) {
  app.get("/api/imports", { preHandler: [app.requireAuth] }, async (request) => {
    const limitParsed = z.coerce.number().int().min(1).max(200).default(20).safeParse((request.query as any).limit);
    const limit = limitParsed.success ? limitParsed.data : 20;
    const { rows } = await query(
      `SELECT id, source_type, mode, record_count, status, started_at, completed_at, error_summary
       FROM imports
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );
    return {
      data: rows.map((r: any) => ({
        id: r.id,
        sourceType: r.source_type,
        mode: r.mode,
        recordCount: r.record_count,
        status: r.status,
        createdAt: r.started_at,
        errorDetails: r.error_summary
      }))
    };
  });

  app.post("/api/imports/bank-csv/preview", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = parseBody(reply, CsvBankUploadSchema, request.body);
    const rows = parseCsvLines(body.csv);
    const mappedRows = mapCsvBankRows(rows);

    // Check which externalTxnIds already exist
    const externalIds = mappedRows
      .map((r) => r.externalTxnId)
      .filter((id): id is string => !!id);

    let existingIds = new Set<string>();
    if (externalIds.length > 0) {
      const result = await query<{ external_txn_id: string }>(
        `SELECT external_txn_id FROM bank_transactions WHERE external_txn_id = ANY($1)`,
        [externalIds]
      );
      existingIds = new Set(result.rows.map((r) => r.external_txn_id));
    }

    const previewRows = mappedRows.map((r) => ({
      ...r,
      duplicate: !!r.externalTxnId && existingIds.has(r.externalTxnId)
    }));

    const duplicateCount = previewRows.filter((r) => r.duplicate).length;

    return {
      rows: previewRows,
      total: previewRows.length,
      duplicateCount,
    };
  });

  app.post("/api/imports/bank-csv", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = parseBody(reply, CsvBankUploadSchema, request.body);
    const rows = parseCsvLines(body.csv);
    const mappedRows = mapCsvBankRows(rows);
    const parsed = parseBody(reply, BankImportSchema, { rows: mappedRows, mode: "csv" });

    // Filter out excluded rows (duplicates + user-discarded)
    const excludeSet = new Set(body.excludeExternalIds ?? []);
    const filteredRows = excludeSet.size > 0
      ? parsed.rows.filter((r: any) => !r.externalTxnId || !excludeSet.has(r.externalTxnId))
      : parsed.rows;

    const result = await withTransaction(async (client) => {
      const importRow = await client.query<{ id: string }>(
        `INSERT INTO imports (source_type, mode, checksum, record_count, status)
         VALUES ('bank', 'csv', NULL, $1, 'processing')
         RETURNING id`,
        [filteredRows.length]
      );
      const importId = importRow.rows[0]!.id;

      const aliases = await client.query<{ player_id: string; alias_raw: string }>(
        `SELECT player_id, alias_raw FROM player_aliases`
      );
      const players = await client.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM players`
      );
      const candidates: MatchCandidate[] = [];
      for (const p of players.rows) {
        if (p.display_name) candidates.push({ playerId: p.id, aliasRaw: p.display_name });
      }
      for (const row of aliases.rows) {
        if (row.alias_raw) candidates.push({ playerId: row.player_id, aliasRaw: row.alias_raw });
      }

      const { posted, queued } = await processBankRows(client, filteredRows, candidates);

      await client.query(`UPDATE imports SET status = 'completed', completed_at = NOW() WHERE id = $1`, [importId]);
      return { importId, posted, queued };
    });

    reply.code(201);
    return result;
  });

  app.post("/api/webhooks/bank-transactions", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    assertWebhookSecret(request, reply);
    const body = parseBody(reply, WebhookBankSchema, request.body);
    const parsed = parseBody(reply, BankImportSchema, { rows: body.rows, mode: "webhook" });

    const result = await withTransaction(async (client) => {
      const importRow = await client.query<{ id: string }>(
        `INSERT INTO imports (source_type, mode, checksum, record_count, status)
         VALUES ('bank', 'webhook', NULL, $1, 'processing')
         RETURNING id`,
        [parsed.rows.length]
      );
      const importId = importRow.rows[0]!.id;

      const aliases = await client.query<{ player_id: string; alias_raw: string }>(
        `SELECT player_id, alias_raw FROM player_aliases`
      );
      const players = await client.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM players`
      );
      const candidates: MatchCandidate[] = [];
      for (const p of players.rows) {
        if (p.display_name) candidates.push({ playerId: p.id, aliasRaw: p.display_name });
      }
      for (const row of aliases.rows) {
        if (row.alias_raw) candidates.push({ playerId: row.player_id, aliasRaw: row.alias_raw });
      }

      const { posted, queued } = await processBankRows(client, parsed.rows, candidates);

      await client.query(`UPDATE imports SET status = 'completed', completed_at = NOW() WHERE id = $1`, [importId]);
      return { importId, posted, queued };
    });

    reply.code(201);
    return result;
  });

  app.post("/api/webhooks/facebook-attendance", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    assertWebhookSecret(request, reply);
    const body = parseBody(reply, WebhookAttendanceSchema, request.body);

    const result = await withTransaction(async (client) => {
      const gameResult = await client.query<{ fee_cents: number }>(`SELECT fee_cents FROM games WHERE id = $1`, [body.gameId]);
      if (gameResult.rowCount === 0) {
        throw reply.notFound("Game not found");
      }
      const feeCents = gameResult.rows[0]!.fee_cents;

      const aliases = await client.query<{ player_id: string; alias_raw: string }>(
        `SELECT player_id, alias_raw FROM player_aliases`
      );
      const players = await client.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM players`
      );
      const candidates: MatchCandidate[] = [];
      for (const p of players.rows) {
        if (p.display_name) candidates.push({ playerId: p.id, aliasRaw: p.display_name });
      }
      for (const row of aliases.rows) {
        if (row.alias_raw) candidates.push({ playerId: row.player_id, aliasRaw: row.alias_raw });
      }

      let imported = 0;
      let charged = 0;
      let queued = 0;

      for (const row of body.rows) {
        const match = matchPlayerByAlias(row.playerName, candidates);
        if (!match.matched) {
          await client.query(
            `INSERT INTO reconciliation_queue (item_type, source_record_id, payload, suggested_player_id, confidence, reason)
             VALUES ('attendance', $1, $2::jsonb, $3, $4, $5)`,
            [body.gameId, JSON.stringify(row), match.playerId, match.confidence, match.reason]
          );
          queued += 1;
          continue;
        }

        const chargeable = isChargeableStatus(row.sourceStatus);
        const attendance = await client.query<{ id: string }>(
          `INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (game_id, player_id) DO NOTHING
           RETURNING id`,
          [body.gameId, match.playerId, row.sourceStatus, chargeable, row.sourceRef ?? null]
        );

        // If no row was returned the player was already recorded for this game — skip.
        if (attendance.rowCount === 0) continue;

        imported += 1;

        if (chargeable) {
          await insertLedgerEntry(client, {
            playerId: match.playerId,
            type: "charge",
            amountCents: feeCents,
            gameId: body.gameId,
            attendanceId: attendance.rows[0]!.id
          });
          charged += 1;
        }
      }

      // Update game status from pending -> synced after successful attendance import
      if (imported > 0) {
        await client.query(
          `UPDATE games SET status = 'synced', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
          [body.gameId]
        );
      }

      return { imported, charged, queued };
    });

    reply.code(201);
    return result;
  });

  app.post("/api/webhooks/bank-pocketsmith", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    assertWebhookSecret(request, reply);
    const body = parseBody(reply, WebhookPocketsmithSchema, request.body);

    // Flatten all transactions from all response objects
    const transactions = body.flatMap((item) => item.response.transactions);

    // Transform Pocketsmith format → internal ProcessBankRowInput format
    const mappedRows = transactions.map((tx) => ({
      externalTxnId: `${tx.id}`,
      postedAtUtc: new Date(tx.date).toISOString(),
      amountCents: Math.round(tx.amount * 100),
      descriptionRaw: tx.description,
      tagNames: tx.tagNames,
    }));

    const parsed = parseBody(reply, BankImportSchema, { rows: mappedRows, mode: "webhook" });

    const result = await withTransaction(async (client) => {
      const importRow = await client.query<{ id: string }>(
        `INSERT INTO imports (source_type, mode, checksum, record_count, status)
         VALUES ('bank', 'pocketsmith', NULL, $1, 'processing')
         RETURNING id`,
        [parsed.rows.length]
      );
      const importId = importRow.rows[0]!.id;

      const aliases = await client.query<{ player_id: string; alias_raw: string }>(
        `SELECT player_id, alias_raw FROM player_aliases`
      );
      const players = await client.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM players`
      );
      const candidates: MatchCandidate[] = [];
      for (const p of players.rows) {
        if (p.display_name) candidates.push({ playerId: p.id, aliasRaw: p.display_name });
      }
      for (const row of aliases.rows) {
        if (row.alias_raw) candidates.push({ playerId: row.player_id, aliasRaw: row.alias_raw });
      }

      // Pass the original mapped rows (with tagNames) instead of parsed rows
      const { posted, queued } = await processBankRows(client, mappedRows, candidates);

      await client.query(`UPDATE imports SET status = 'completed', completed_at = NOW() WHERE id = $1`, [importId]);
      return { importId, posted, queued };
    });

    reply.code(201);
    return result;
  });
}
