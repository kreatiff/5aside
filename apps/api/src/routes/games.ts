import type { FastifyInstance } from "fastify";
import { GameCreateSchema, GameUpdateSchema, AttendanceImportSchema } from "@fiveaside/contracts";
import { matchPlayerByAlias, isChargeableStatus, MatchCandidate } from "@fiveaside/recon";
import { query, withTransaction } from "../db/helpers.js";
import { mapGame, type GameRow } from "../utils/mappers.js";
import { parseBody, parseUuidParam } from "../utils/request.js";
import { snapshotFeeForGame, canEditGameFee } from "../services/fees.js";
import { insertLedgerEntry } from "../services/ledger.js";

export async function gameRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/games", async (request) => {
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;

    const countResult = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM games`);
    const total = Number(countResult.rows[0]?.count || 0);

    const result = await query<GameRow & { attendance_count: string }>(
      `SELECT g.id, g.external_event_id, g.game_date, g.kickoff_at_utc, g.fee_cents, g.source, g.status, g.created_at, g.updated_at,
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
}
