import type { FastifyInstance } from "fastify";
import { PlayerCreateSchema, PlayerUpdateSchema, PlayerAliasCreateSchema } from "@fiveaside/contracts";
import { normalizeName } from "@fiveaside/recon";
import { query, withTransaction } from "../db/helpers.js";
import { rescanPendingTransactionsForPlayer } from "../services/bank-import.js";
import { mapPlayer, type PlayerRow } from "../utils/mappers.js";
import { parseBody, parseUuidParam } from "../utils/request.js";
import { pool } from "../db/pool.js";
import { z } from "zod";

export async function playerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/players", async (request) => {
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;
    const activeOnly = (request.query as any).active === 'true';

    const countQuery = activeOnly ? `SELECT COUNT(*)::text AS count FROM players WHERE active = true` : `SELECT COUNT(*)::text AS count FROM players`;
    const countResult = await query<{ count: string }>(countQuery);
    const total = Number(countResult.rows[0]?.count || 0);

    const whereClause = activeOnly ? `WHERE p.active = true` : ``;
    const result = await query<PlayerRow & { last_game_date: string | null }>(
      `SELECT p.id, p.display_name, p.active, p.current_balance_cents, p.notes, p.created_at, p.updated_at,
              (SELECT MAX(g.game_date)::text FROM attendance a JOIN games g ON g.id = a.game_id WHERE a.player_id = p.id) AS last_game_date
       FROM players p
       ${whereClause}
       ORDER BY p.display_name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { 
      data: result.rows.map(row => ({
        ...mapPlayer(row),
        lastGameDate: row.last_game_date
      })),
      total,
      limit,
      offset
    };
  });

  app.post("/api/players", async (request, reply) => {
    const body = parseBody(reply, PlayerCreateSchema, request.body);
    const result = await withTransaction(async (client) => {
      // 1. Create the player
      const playerResult = await client.query<PlayerRow>(
        `INSERT INTO players (display_name, active, notes)
         VALUES ($1, $2, $3)
         RETURNING id, display_name, active, current_balance_cents, notes, created_at, updated_at`,
        [body.displayName, body.active ?? true, body.notes ?? null]
      );
      const playerId = playerResult.rows[0]!.id;

      // 2. Auto-create alias from display name
      const aliasNormalized = body.displayName.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      await client.query(
        `INSERT INTO player_aliases (player_id, source, alias_raw, alias_normalized)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, source, alias_normalized) DO NOTHING`,
        [playerId, "system", body.displayName, aliasNormalized]
      );

      return playerResult.rows[0]!;
    });
    reply.code(201);
    return { player: mapPlayer(result) };
  });

  app.patch("/api/players/bulk-status", async (request, reply) => {
    const bodySchema = z.object({
      playerIds: z.array(z.string().uuid()),
      isActive: z.boolean(),
    });
    const body = parseBody(reply, bodySchema, request.body);

    if (body.playerIds.length === 0) {
      return { updated: 0 };
    }

    const result = await query(
      `UPDATE players SET active = $1 WHERE id = ANY($2)`,
      [body.isActive, body.playerIds]
    );

    return { updated: result.rowCount };
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

    const result = await withTransaction(async (client) => {
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
      const playerResult = await client.query<PlayerRow>(
        `UPDATE players
         SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${index}
         RETURNING id, display_name, active, current_balance_cents, notes, created_at, updated_at`,
        values
      );
      if (playerResult.rowCount === 0) {
        throw reply.notFound("Player not found");
      }

      // If display name changed, update the system alias
      if (body.displayName !== undefined) {
        const aliasNormalized = body.displayName.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        // Delete old system alias if it exists
        await client.query(
          `DELETE FROM player_aliases WHERE player_id = $1 AND source = 'system'`,
          [id]
        );
        // Create new system alias
        await client.query(
          `INSERT INTO player_aliases (player_id, source, alias_raw, alias_normalized)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (player_id, source, alias_normalized) DO NOTHING`,
          [id, "system", body.displayName, aliasNormalized]
        );
      }

      return playerResult.rows[0]!;
    });

    if (!result) {
      throw reply.notFound("Player not found");
    }
    return { player: mapPlayer(result) };
  });

  app.get("/api/players/:id/aliases", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const result = await query<{
      id: string;
      player_id: string;
      source: string;
      alias_raw: string;
      alias_normalized: string;
      created_at: Date;
    }>(
      `SELECT id, player_id, source, alias_raw, alias_normalized, created_at
       FROM player_aliases
       WHERE player_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    return {
      aliases: result.rows.map(r => ({
        id: r.id,
        playerId: r.player_id,
        sourceType: r.source,
        aliasRaw: r.alias_raw,
        aliasNormalized: r.alias_normalized,
        createdAt: r.created_at
      }))
    };
  });

  app.post("/api/players/:id/aliases", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const body = request.body as { source?: string; aliasRaw?: string };
    
    if (!body || !body.source || !body.aliasRaw) {
      throw reply.badRequest("source and aliasRaw are required");
    }

    const { source, aliasRaw } = body;
    const aliasNormalized = aliasRaw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

    const result = await withTransaction(async (client) => {
      // 1. Insert the new alias
      const insertResult = await client.query<{
        id: string;
        player_id: string;
        source: string;
        alias_raw: string;
        alias_normalized: string;
        created_at: Date;
      }>(
        `INSERT INTO player_aliases (player_id, source, alias_raw, alias_normalized)
         VALUES ($1, $2, $3, $4)
         RETURNING id, player_id, source, alias_raw, alias_normalized, created_at`,
        [id, source, aliasRaw, aliasNormalized]
      );
      
      // 2. Rescan the reconciliation queue for this player
      const mappedCount = await rescanPendingTransactionsForPlayer(client, id);
      
      return { aliasRow: insertResult.rows[0]!, mappedCount };
    });

    const r = result.aliasRow;
    return reply.status(201).send({
      alias: {
        id: r.id,
        playerId: r.player_id,
        sourceType: r.source,
        aliasRaw: r.alias_raw,
        aliasNormalized: r.alias_normalized,
        createdAt: r.created_at
      },
      transactionsMapped: result.mappedCount
    });
  });

  app.delete("/api/players/:id/aliases/:aliasId", async (request, reply) => {
    const playerId = parseUuidParam(request, reply, "id");
    const aliasId = parseUuidParam(request, reply, "aliasId");

    const result = await query(
      `DELETE FROM player_aliases WHERE id = $1 AND player_id = $2`,
      [aliasId, playerId]
    );

    if (result.rowCount === 0) {
      throw reply.notFound("Alias not found");
    }

    return { deleted: true };
  });

  app.get("/api/players/:id/ledger", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger_entries WHERE player_id = $1`,
      [id]
    );
    const total = Number(countResult.rows[0]?.count || 0);

    const result = await query<{
      id: string;
      player_id: string;
      type: string;
      amount_cents: number;
      created_at: Date;
      game_date: string | null;
      bank_posted_at: string | null;
      adjustment_reason: string | null;
    }>(
      `SELECT le.id, le.player_id, le.type, le.amount_cents, le.created_at, le.adjustment_reason,
              g.game_date::text AS game_date,
              bt.posted_at_utc::text AS bank_posted_at
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
       WHERE le.player_id = $1
       ORDER BY COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    return {
      data: result.rows,
      total,
      limit,
      offset
    };
  });

  app.post("/api/players/merge", async (request, reply) => {
    const body = parseBody(
      reply,
      z.object({
        sourcePlayerIds: z.array(z.string().uuid()).min(1),
        targetPlayerId: z.string().uuid()
      }),
      request.body
    );

    const { sourcePlayerIds, targetPlayerId } = body;
    
    if (sourcePlayerIds.includes(targetPlayerId)) {
      throw reply.badRequest("Source and target cannot be the same");
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const sourceId of sourcePlayerIds) {
        // Move aliases (ignore exact match conflicts)
        await client.query(`
          UPDATE player_aliases src SET player_id = $1 
          WHERE player_id = $2 AND NOT EXISTS (
            SELECT 1 FROM player_aliases tgt 
            WHERE tgt.player_id = $1 
              AND tgt.source = src.source 
              AND tgt.alias_normalized = src.alias_normalized
          )
        `, [targetPlayerId, sourceId]);
        await client.query(`DELETE FROM player_aliases WHERE player_id = $1`, [sourceId]);

        // Move ledger entries
        await client.query(`UPDATE ledger_entries SET player_id = $1 WHERE player_id = $2`, [targetPlayerId, sourceId]);

        // Delete clashing attendance records
        await client.query(`
          DELETE FROM attendance 
          WHERE player_id = $2 AND game_id IN (
            SELECT game_id FROM attendance WHERE player_id = $1
          )
        `, [targetPlayerId, sourceId]);
        
        // Move remaining attendance
        await client.query(`UPDATE attendance SET player_id = $1 WHERE player_id = $2`, [targetPlayerId, sourceId]);

        // Delete source player
        await client.query(`DELETE FROM players WHERE id = $1`, [sourceId]);
      }

      // Recalculate target balance by summarizing all ledgers
      await client.query(`
        UPDATE players 
        SET current_balance_cents = COALESCE((
          SELECT SUM(
            CASE 
              WHEN type = 'charge' THEN amount_cents
              WHEN type = 'payment' THEN -amount_cents
              WHEN type = 'adjustment' THEN amount_cents
              ELSE 0
            END
          ) FROM ledger_entries WHERE player_id = $1
        ), 0)
        WHERE id = $1
      `, [targetPlayerId]);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    reply.code(200);
    return { success: true };
  });

}
