import type { FastifyInstance } from "fastify";
import { GameCreateSchema, GameUpdateSchema, GameBatchCreateSchema, GameBatchUpdateSchema, AttendanceImportSchema } from "@fiveaside/contracts";
import { matchPlayerByAlias, isChargeableStatus, MatchCandidate } from "@fiveaside/recon";
import { query, withTransaction } from "../db/helpers.js";
import { mapGame, type GameRow } from "../utils/mappers.js";
import { parseBody, parseUuidParam } from "../utils/request.js";
import { snapshotFeeForGame, canEditGameFee } from "../services/fees.js";
import { insertLedgerEntry } from "../services/ledger.js";
import { extractFacebookEventId } from "../utils/facebook.js";
import { generateGameDates } from "../utils/dates.js";

const GAME_COLS = `id, external_event_id, facebook_event_url, game_date, kickoff_at_utc, fee_cents, source, status, created_at, updated_at`;

export async function gameRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/games", async (request) => {
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;

    // Auto-transition scheduled games whose date has passed to pending
    await query(
      `UPDATE games SET status = 'pending', updated_at = NOW()
       WHERE status = 'scheduled' AND game_date < CURRENT_DATE`
    );

    const countResult = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM games`);
    const total = Number(countResult.rows[0]?.count || 0);

    const result = await query<GameRow & { attendance_count: string }>(
      `SELECT g.id, g.external_event_id, g.facebook_event_url, g.game_date, g.kickoff_at_utc,
              g.fee_cents, g.source, g.status, g.created_at, g.updated_at,
              (SELECT COUNT(*)::text FROM attendance a WHERE a.game_id = g.id) AS attendance_count
       FROM games g
       ORDER BY g.game_date DESC, g.kickoff_at_utc DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      data: result.rows.map(row => ({
        ...mapGame(row),
        attendanceCount: Number(row.attendance_count)
      })),
      total,
      limit,
      offset
    };
  });

  app.post("/api/games", async (request, reply) => {
    const body = parseBody(reply, GameCreateSchema, request.body);

    const created = await withTransaction(async (client) => {
      const settings = await client.query<{ current_game_fee_cents: number }>(
        `SELECT current_game_fee_cents FROM settings WHERE id = 1`
      );
      const snapshotFee = snapshotFeeForGame(settings.rows[0]!.current_game_fee_cents);

      const eventId = body.facebookEventUrl
        ? extractFacebookEventId(body.facebookEventUrl)
        : (body.externalEventId ?? null);

      const inserted = await client.query<GameRow>(
        `INSERT INTO games (external_event_id, facebook_event_url, game_date, kickoff_at_utc, fee_cents, source, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${GAME_COLS}`,
        [eventId, body.facebookEventUrl ?? null, body.gameDate, body.kickoffAtUtc ?? null, snapshotFee, body.source, body.status]
      );
      return inserted.rows[0]!;
    });

    reply.code(201);
    return { game: mapGame(created) };
  });

  app.post("/api/games/batch", async (request, reply) => {
    const body = parseBody(reply, GameBatchCreateSchema, request.body);

    const dates = generateGameDates(body.startDate, body.frequency, body.facebookEventUrls.length);
    const today = new Date().toISOString().slice(0, 10);

    const created = await withTransaction(async (client) => {
      const settings = await client.query<{ current_game_fee_cents: number }>(
        `SELECT current_game_fee_cents FROM settings WHERE id = 1`
      );
      const snapshotFee = snapshotFeeForGame(settings.rows[0]!.current_game_fee_cents);

      const games: GameRow[] = [];

      for (let i = 0; i < dates.length; i++) {
        const gameDate = dates[i]!;
        const url = body.facebookEventUrls[i]!;
        const eventId = extractFacebookEventId(url);
        const status = gameDate >= today ? "scheduled" : "pending";

        const inserted = await client.query<GameRow>(
          `INSERT INTO games (external_event_id, facebook_event_url, game_date, kickoff_at_utc, fee_cents, source, status)
           VALUES ($1, $2, $3, NULL, $4, 'facebook', $5)
           RETURNING ${GAME_COLS}`,
          [eventId, url, gameDate, snapshotFee, status]
        );
        games.push(inserted.rows[0]!);
      }

      return games;
    });

    reply.code(201);
    return {
      games: created.map(mapGame),
      summary: {
        total: created.length,
        scheduled: created.filter(g => g.status === "scheduled").length,
        pending: created.filter(g => g.status === "pending").length,
      }
    };
  });

  app.patch("/api/games/batch", async (request, reply) => {
    const body = parseBody(reply, GameBatchUpdateSchema, request.body);

    const result = await withTransaction(async (client) => {
      const updated: Array<{ gameId: string; success: boolean; reason?: string }> = [];

      for (const gameId of body.gameIds) {
        const gameResult = await client.query<GameRow>(
          `SELECT ${GAME_COLS} FROM games WHERE id = $1 FOR UPDATE`,
          [gameId]
        );
        if (gameResult.rowCount === 0) {
          updated.push({ gameId, success: false, reason: "Game not found" });
          continue;
        }

        const game = gameResult.rows[0]!;

        // Check if fee can be edited
        const charges = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ledger_entries WHERE game_id = $1 AND type = 'charge'`,
          [gameId]
        );
        const hasCharges = Number(charges.rows[0]!.count) > 0;

        if (!canEditGameFee(hasCharges)) {
          updated.push({ gameId, success: false, reason: "Game has charges or is synced/cancelled" });
          continue;
        }

        // Update the game fee
        await client.query(
          `UPDATE games SET fee_cents = $1, updated_at = NOW() WHERE id = $2`,
          [body.feeCents, gameId]
        );
        updated.push({ gameId, success: true });
      }

      return updated;
    });

    return {
      updated: result,
      summary: {
        total: result.length,
        successful: result.filter(r => r.success).length,
        failed: result.filter(r => !r.success).length
      }
    };
  });

  app.get("/api/games/:id", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const result = await query<GameRow>(
      `SELECT ${GAME_COLS}
       FROM games
       WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      throw reply.notFound("Game not found");
    }

    const attendanceResult = await query<{
      id: string;
      player_id: string;
      display_name: string;
      source_status: string;
      chargeable: boolean;
    }>(
      `SELECT a.id, a.player_id, p.display_name, a.source_status, a.chargeable
       FROM attendance a
       JOIN players p ON p.id = a.player_id
       WHERE a.game_id = $1
       ORDER BY p.display_name ASC`,
      [id]
    );

    const gameData = {
      ...mapGame(result.rows[0]!),
      attendance: attendanceResult.rows.map(row => ({
        id: row.id,
        playerId: row.player_id,
        displayName: row.display_name,
        sourceStatus: row.source_status,
        chargeable: row.chargeable
      }))
    };

    return { game: gameData };
  });

  app.patch("/api/games/:id", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const body = parseBody(reply, GameUpdateSchema, request.body);

    const updated = await withTransaction(async (client) => {
      const game = await client.query<GameRow>(
        `SELECT ${GAME_COLS}
         FROM games
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (game.rowCount === 0) {
        throw reply.notFound("Game not found");
      }

      const currentGame = game.rows[0]!;

      // Handle fee update
      if (body.feeCents !== undefined) {
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
      }

      // Handle status update — only allow setting cancelled manually
      if (body.status !== undefined && body.status !== "cancelled") {
        throw reply.badRequest("Only 'cancelled' status can be set manually");
      }

      const newFee = body.feeCents ?? currentGame.fee_cents;
      const newStatus = body.status ?? currentGame.status;

      const result = await client.query<GameRow>(
        `UPDATE games
         SET fee_cents = $1, status = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING ${GAME_COLS}`,
        [newFee, newStatus, id]
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
           ON CONFLICT (game_id, player_id) DO NOTHING
           RETURNING id`,
          [gameId, match.playerId, row.sourceStatus, chargeable, row.sourceRef ?? null]
        );

        // If no row was returned the player was already recorded for this game — skip.
        if (attendance.rowCount === 0) continue;

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

      // Auto-transition pending → synced after successful import
      if (imported > 0) {
        await client.query(
          `UPDATE games SET status = 'synced', updated_at = NOW()
           WHERE id = $1 AND status = 'pending'`,
          [gameId]
        );
      }

      return { imported, charged, queued };
    });

    reply.code(201);
    return summary;
  });
}
