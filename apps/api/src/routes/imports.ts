import type { FastifyInstance } from "fastify";
import { CsvBankUploadSchema, BankImportSchema, WebhookBankSchema, WebhookAttendanceSchema } from "@fiveaside/contracts";
import { parseCsvLines, matchPlayerByAlias, isChargeableStatus, MatchCandidate } from "@fiveaside/recon";
import { parseBody, assertWebhookSecret } from "../utils/request.js";
import { withTransaction, query } from "../db/helpers.js";
import { processBankRows } from "../services/bank-import.js";
import { insertLedgerEntry } from "../services/ledger.js";

export async function importRoutes(app: FastifyInstance) {
  app.get("/api/imports", { preHandler: [app.requireAuth] }, async (request) => {
    const limit = Number((request.query as any).limit) || 20;
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

  app.post("/api/imports/bank-csv", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = parseBody(reply, CsvBankUploadSchema, request.body);
    const rows = parseCsvLines(body.csv);
    const hasHeader = rows.length > 0 && rows[0]![0]?.toLowerCase().includes("posted");
    const sourceRows = hasHeader ? rows.slice(1) : rows;
    const mappedRows = sourceRows
      .filter((row) => row.length >= 3)
      .map((row) => ({
        postedAtUtc: row[0]!,
        amountCents: Number(row[1]),
        descriptionRaw: row[2]!,
        externalTxnId: row[3] || undefined,
        sourceRef: row[4] || undefined
      }));
    const parsed = parseBody(reply, BankImportSchema, { rows: mappedRows, mode: "csv" });

    const result = await withTransaction(async (client) => {
      const importRow = await client.query<{ id: string }>(
        `INSERT INTO imports (source_type, mode, checksum, record_count, status)
         VALUES ('bank', 'csv', NULL, $1, 'processing')
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

  app.post("/api/webhooks/bank-transactions", async (request, reply) => {
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

  app.post("/api/webhooks/facebook-attendance", async (request, reply) => {
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
}
