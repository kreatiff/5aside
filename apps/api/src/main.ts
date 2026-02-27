import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import {
  AdjustmentCreateSchema,
  AttendanceImportSchema,
  BankImportSchema,
  CsvBankUploadSchema,
  FeeUpdateSchema,
  GameCreateSchema,
  GameUpdateSchema,
  PlayerAliasCreateSchema,
  PlayerCreateSchema,
  PlayerUpdateSchema,
  ReconcileResolveSchema,
  WebhookAttendanceSchema,
  WebhookBankSchema
} from "@fiveaside/contracts";
import { isChargeableStatus, matchPlayerByAlias, normalizeName, parseCsvLines } from "@fiveaside/recon";
import { z } from "zod";
import { env } from "./config.js";
import { query, withTransaction } from "./db/helpers.js";
import { pool } from "./db/pool.js";
import { canEditGameFee, snapshotFeeForGame } from "./services/fees.js";
import { insertLedgerEntry } from "./services/ledger.js";

type PlayerRow = {
  id: string;
  display_name: string;
  active: boolean;
  current_balance_cents: number;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type GameRow = {
  id: string;
  external_event_id: string | null;
  game_date: Date | string;
  kickoff_at_utc: Date | string | null;
  fee_cents: number;
  source: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString();
}

function toDateString(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function mapPlayer(row: PlayerRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    active: row.active,
    currentBalanceCents: row.current_balance_cents,
    notes: row.notes,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function mapGame(row: GameRow) {
  return {
    id: row.id,
    externalEventId: row.external_event_id,
    gameDate: toDateString(row.game_date),
    kickoffAtUtc: toIso(row.kickoff_at_utc),
    feeCents: row.fee_cents,
    source: row.source,
    status: row.status,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function parseBody<S extends z.ZodTypeAny>(reply: FastifyReply, schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw reply.badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }
  return parsed.data;
}

function parseUuidParam(request: FastifyRequest, reply: FastifyReply, key: string): string {
  const params = request.params as Record<string, unknown>;
  const parsed = z.string().uuid().safeParse(params[key]);
  if (!parsed.success) {
    throw reply.badRequest(`Invalid ${key}`);
  }
  return parsed.data;
}

function assertWebhookSecret(request: FastifyRequest, reply: FastifyReply): void {
  const incomingSecret = request.headers["x-webhook-secret"];
  if (incomingSecret !== env.WEBHOOK_SHARED_SECRET) {
    throw reply.unauthorized("Invalid webhook secret");
  }
}

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(cookie);
  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? false : true,
    credentials: true
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/players", async () => {
    const result = await query<PlayerRow>(
      `SELECT id, display_name, active, current_balance_cents, notes, created_at, updated_at
       FROM players
       ORDER BY display_name ASC`
    );
    return { players: result.rows.map(mapPlayer) };
  });

  app.post("/api/players", async (request, reply) => {
    const body = parseBody(reply, PlayerCreateSchema, request.body);
    const result = await query<PlayerRow>(
      `INSERT INTO players (display_name, active, notes)
       VALUES ($1, $2, $3)
       RETURNING id, display_name, active, current_balance_cents, notes, created_at, updated_at`,
      [body.displayName, body.active ?? true, body.notes ?? null]
    );
    reply.code(201);
    return { player: mapPlayer(result.rows[0]!) };
  });

  app.get("/api/players/:id", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const result = await query<PlayerRow>(
      `SELECT id, display_name, active, current_balance_cents, notes, created_at, updated_at
       FROM players
       WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      throw reply.notFound("Player not found");
    }
    return { player: mapPlayer(result.rows[0]!) };
  });

  app.patch("/api/players/:id", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const body = parseBody(reply, PlayerUpdateSchema, request.body);
    const updates: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (body.displayName !== undefined) {
      updates.push(`display_name = $${index++}`);
      values.push(body.displayName);
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${index++}`);
      values.push(body.notes);
    }
    if (body.active !== undefined) {
      updates.push(`active = $${index++}`);
      values.push(body.active);
    }

    if (updates.length === 0) {
      throw reply.badRequest("At least one field is required");
    }

    values.push(id);
    const result = await query<PlayerRow>(
      `UPDATE players
       SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${index}
       RETURNING id, display_name, active, current_balance_cents, notes, created_at, updated_at`,
      values
    );
    if (result.rowCount === 0) {
      throw reply.notFound("Player not found");
    }
    return { player: mapPlayer(result.rows[0]!) };
  });

  app.post("/api/players/:id/aliases", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const body = parseBody(reply, PlayerAliasCreateSchema, request.body);
    await query(
      `INSERT INTO player_aliases (player_id, source, alias_raw, alias_normalized)
       VALUES ($1, $2, $3, $4)`,
      [id, body.source, body.aliasRaw, normalizeName(body.aliasRaw)]
    );
    reply.code(201);
    return { ok: true };
  });

  app.get("/api/settings", async () => {
    const settingsResult = await query<{ current_game_fee_cents: number; app_timezone: string; updated_at: Date | string }>(
      `SELECT current_game_fee_cents, app_timezone, updated_at
       FROM settings
       WHERE id = 1`
    );
    const historyResult = await query<{
      id: string;
      old_fee_cents: number;
      new_fee_cents: number;
      changed_by_admin_id: string;
      changed_at: Date | string;
    }>(
      `SELECT id, old_fee_cents, new_fee_cents, changed_by_admin_id, changed_at
       FROM fee_change_log
       ORDER BY changed_at DESC
       LIMIT 20`
    );
    const settings = settingsResult.rows[0]!;
    return {
      settings: {
        currentGameFeeCents: settings.current_game_fee_cents,
        appTimezone: settings.app_timezone,
        updatedAt: toIso(settings.updated_at)!
      },
      history: historyResult.rows.map((row) => ({
        id: row.id,
        oldFeeCents: row.old_fee_cents,
        newFeeCents: row.new_fee_cents,
        changedByAdminId: row.changed_by_admin_id,
        changedAt: toIso(row.changed_at)!
      }))
    };
  });

  app.patch("/api/settings/game-fee", async (request, reply) => {
    const body = parseBody(reply, FeeUpdateSchema, request.body);
    const adminId = z.string().uuid().safeParse(request.headers["x-admin-id"]);
    if (!adminId.success) {
      throw reply.badRequest("Missing or invalid x-admin-id header");
    }

    const result = await withTransaction(async (client) => {
      const settings = await client.query<{ current_game_fee_cents: number }>(
        `SELECT current_game_fee_cents FROM settings WHERE id = 1 FOR UPDATE`
      );
      const oldFee = settings.rows[0]!.current_game_fee_cents;
      if (oldFee === body.newFeeCents) {
        return { oldFee, newFee: body.newFeeCents, changed: false };
      }

      await client.query(`UPDATE settings SET current_game_fee_cents = $1, updated_at = NOW() WHERE id = 1`, [body.newFeeCents]);
      await client.query(
        `INSERT INTO fee_change_log (old_fee_cents, new_fee_cents, changed_by_admin_id)
         VALUES ($1, $2, $3)`,
        [oldFee, body.newFeeCents, adminId.data]
      );
      return { oldFee, newFee: body.newFeeCents, changed: true };
    });

    return result;
  });

  app.get("/api/games", async () => {
    const result = await query<GameRow>(
      `SELECT id, external_event_id, game_date, kickoff_at_utc, fee_cents, source, status, created_at, updated_at
       FROM games
       ORDER BY game_date DESC, kickoff_at_utc DESC NULLS LAST`
    );
    return { games: result.rows.map(mapGame) };
  });

  app.post("/api/games", async (request, reply) => {
    const body = parseBody(reply, GameCreateSchema, request.body);

    const created = await withTransaction(async (client) => {
      const settings = await client.query<{ current_game_fee_cents: number }>(
        `SELECT current_game_fee_cents FROM settings WHERE id = 1`
      );
      const snapshotFee = snapshotFeeForGame(settings.rows[0]!.current_game_fee_cents);
      const inserted = await client.query<GameRow>(
        `INSERT INTO games (external_event_id, game_date, kickoff_at_utc, fee_cents, source, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, external_event_id, game_date, kickoff_at_utc, fee_cents, source, status, created_at, updated_at`,
        [body.externalEventId ?? null, body.gameDate, body.kickoffAtUtc ?? null, snapshotFee, body.source, body.status]
      );
      return inserted.rows[0]!;
    });

    reply.code(201);
    return { game: mapGame(created) };
  });

  app.get("/api/games/:id", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const result = await query<GameRow>(
      `SELECT id, external_event_id, game_date, kickoff_at_utc, fee_cents, source, status, created_at, updated_at
       FROM games
       WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      throw reply.notFound("Game not found");
    }
    return { game: mapGame(result.rows[0]!) };
  });

  app.patch("/api/games/:id", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const body = parseBody(reply, GameUpdateSchema, request.body);

    const updated = await withTransaction(async (client) => {
      const game = await client.query<GameRow>(
        `SELECT id, external_event_id, game_date, kickoff_at_utc, fee_cents, source, status, created_at, updated_at
         FROM games
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (game.rowCount === 0) {
        throw reply.notFound("Game not found");
      }

      const charges = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM ledger_entries
         WHERE game_id = $1 AND type = 'charge'`,
        [id]
      );
      const hasCharges = Number(charges.rows[0]!.count) > 0;
      if (!canEditGameFee(hasCharges)) {
        throw reply.conflict("Game fee is locked because charges already exist");
      }

      const result = await client.query<GameRow>(
        `UPDATE games
         SET fee_cents = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, external_event_id, game_date, kickoff_at_utc, fee_cents, source, status, created_at, updated_at`,
        [body.feeCents, id]
      );
      return result.rows[0]!;
    });

    return { game: mapGame(updated) };
  });

  app.post("/api/games/:id/attendance/import", async (request, reply) => {
    const gameId = parseUuidParam(request, reply, "id");
    const body = parseBody(reply, AttendanceImportSchema, request.body);

    const summary = await withTransaction(async (client) => {
      const gameResult = await client.query<{ fee_cents: number }>(`SELECT fee_cents FROM games WHERE id = $1`, [gameId]);
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
            [gameId, JSON.stringify(row), match.confidence, match.reason]
          );
          queued += 1;
          continue;
        }

        const chargeable = isChargeableStatus(row.sourceStatus);
        const attendance = await client.query<{ id: string }>(
          `INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [gameId, match.playerId, row.sourceStatus, chargeable, row.sourceRef ?? null]
        );
        imported += 1;

        if (chargeable) {
          await insertLedgerEntry(client, {
            playerId: match.playerId,
            type: "charge",
            amountCents: feeCents,
            gameId,
            attendanceId: attendance.rows[0]!.id
          });
          charged += 1;
        }
      }

      return { imported, charged, queued };
    });

    reply.code(201);
    return summary;
  });

  app.post("/api/imports/bank-csv", async (request, reply) => {
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

      let posted = 0;
      let queued = 0;

      for (const row of parsed.rows) {
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

      let posted = 0;
      let queued = 0;

      for (const row of parsed.rows) {
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

  app.get("/api/reconciliation-queue", async () => {
    const result = await query<{
      id: string;
      item_type: "attendance" | "bank_transaction";
      source_record_id: string;
      payload: Record<string, unknown> | null;
      suggested_player_id: string | null;
      confidence: string | number;
      reason: string;
      status: "open" | "resolved" | "dismissed";
      resolved_by: string | null;
      resolved_at: Date | string | null;
    }>(
      `SELECT id, item_type, source_record_id, payload, suggested_player_id, confidence, reason, status, resolved_by, resolved_at
       FROM reconciliation_queue
       ORDER BY status ASC, confidence DESC, id ASC`
    );
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        itemType: row.item_type,
        sourceRecordId: row.source_record_id,
        payload: row.payload,
        suggestedPlayerId: row.suggested_player_id,
        confidence: Number(row.confidence),
        reason: row.reason,
        status: row.status,
        resolvedBy: row.resolved_by,
        resolvedAt: toIso(row.resolved_at)
      }))
    };
  });

  app.post("/api/reconciliation-queue/:id/resolve", async (request, reply) => {
    const queueId = parseUuidParam(request, reply, "id");
    const body = parseBody(reply, ReconcileResolveSchema, request.body);
    const adminId = z.string().uuid().safeParse(request.headers["x-admin-id"]);

    const result = await withTransaction(async (client) => {
      const queueItem = await client.query<{
        id: string;
        item_type: "attendance" | "bank_transaction";
        source_record_id: string;
        payload: Record<string, unknown> | null;
        status: string;
      }>(
        `SELECT id, item_type, source_record_id, payload, status
         FROM reconciliation_queue
         WHERE id = $1
         FOR UPDATE`,
        [queueId]
      );
      if (queueItem.rowCount === 0) {
        throw reply.notFound("Queue item not found");
      }
      if (queueItem.rows[0]!.status !== "open") {
        throw reply.conflict("Queue item is already resolved or dismissed");
      }

      const item = queueItem.rows[0]!;
      if (item.item_type === "attendance") {
        const payload = item.payload ?? {};
        const sourceStatus = String(payload.sourceStatus ?? "unknown");
        const sourceRef = payload.sourceRef ? String(payload.sourceRef) : null;
        const chargeable = isChargeableStatus(sourceStatus);

        const attendance = await client.query<{ id: string }>(
          `INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [item.source_record_id, body.playerId, sourceStatus, chargeable, sourceRef]
        );

        if (chargeable) {
          const game = await client.query<{ fee_cents: number }>(`SELECT fee_cents FROM games WHERE id = $1`, [item.source_record_id]);
          if (game.rowCount === 0) {
            throw reply.notFound("Game not found for queue item");
          }
          await insertLedgerEntry(client, {
            playerId: body.playerId,
            type: "charge",
            amountCents: game.rows[0]!.fee_cents,
            gameId: item.source_record_id,
            attendanceId: attendance.rows[0]!.id
          });
        }
      } else {
        const transaction = await client.query<{ amount_cents: number }>(
          `SELECT amount_cents FROM bank_transactions WHERE id = $1`,
          [item.source_record_id]
        );
        if (transaction.rowCount === 0) {
          throw reply.notFound("Bank transaction not found for queue item");
        }

        await insertLedgerEntry(client, {
          playerId: body.playerId,
          type: "payment",
          amountCents: -transaction.rows[0]!.amount_cents,
          bankTransactionId: item.source_record_id
        });
      }

      await client.query(
        `UPDATE reconciliation_queue
         SET status = 'resolved',
             resolved_by = $1,
             resolved_at = NOW(),
             suggested_player_id = $2
         WHERE id = $3`,
        [adminId.success ? adminId.data : null, body.playerId, queueId]
      );

      return { resolved: true };
    });

    return result;
  });

  app.post("/api/ledger/adjustments", async (request, reply) => {
    const body = parseBody(reply, AdjustmentCreateSchema, request.body);
    await withTransaction(async (client) => {
      await insertLedgerEntry(client, {
        playerId: body.playerId,
        type: "adjustment",
        amountCents: body.amountCents,
        adjustmentReason: body.reason ?? null
      });
    });
    reply.code(201);
    return { ok: true };
  });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isMainModule) {
  void start();

  process.on("SIGINT", async () => {
    await pool.end();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await pool.end();
    process.exit(0);
  });
}
