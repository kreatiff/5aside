import type { FastifyInstance } from "fastify";
import { CsvBankUploadSchema, BankImportSchema, WebhookBankSchema, WebhookAttendanceSchema } from "@fiveaside/contracts";
import { parseCsvLines, matchPlayerByAlias, isChargeableStatus } from "@fiveaside/recon";
import { parseBody, assertWebhookSecret } from "../utils/request.js";
import { withTransaction } from "../db/helpers.js";
import { processBankRows } from "../services/bank-import.js";
import { insertLedgerEntry } from "../services/ledger.js";

export async function importRoutes(app: FastifyInstance) {
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

      const aliases = await client.query<{ player_id: string; alias_normalized: string }>(
        `SELECT player_id, alias_normalized FROM player_aliases`
      );
      const candidates = aliases.rows.map((row) => ({
        playerId: row.player_id,
        aliasNormalized: row.alias_normalized
      }));

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

      const aliases = await client.query<{ player_id: string; alias_normalized: string }>(
        `SELECT player_id, alias_normalized FROM player_aliases`
      );
      const candidates = aliases.rows.map((row) => ({
        playerId: row.player_id,
        aliasNormalized: row.alias_normalized
      }));

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

      const aliases = await client.query<{ player_id: string; alias_normalized: string }>(
        `SELECT player_id, alias_normalized FROM player_aliases`
      );
      const candidates = aliases.rows.map((row) => ({
        playerId: row.player_id,
        aliasNormalized: row.alias_normalized
      }));

      let imported = 0;
      let charged = 0;
      let queued = 0;

      for (const row of body.rows) {
        const match = matchPlayerByAlias(row.playerName, candidates);
        if (!match.matched || !match.playerId) {
          await client.query(
            `INSERT INTO reconciliation_queue (item_type, source_record_id, payload, confidence, reason)
             VALUES ('attendance', $1, $2::jsonb, $3, $4)`,
            [body.gameId, JSON.stringify(row), match.confidence, match.reason]
          );
          queued += 1;
          continue;
        }

        const chargeable = isChargeableStatus(row.sourceStatus);
        const attendance = await client.query<{ id: string }>(
          `INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [body.gameId, match.playerId, row.sourceStatus, chargeable, row.sourceRef ?? null]
        );
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

      return { imported, charged, queued };
    });

    reply.code(201);
    return result;
  });
}
