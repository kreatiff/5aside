import type { FastifyInstance } from "fastify";
import { PlayerCreateSchema, PlayerUpdateSchema, PlayerAliasCreateSchema } from "@fiveaside/contracts";
import { normalizeName } from "@fiveaside/recon";
import { query, withTransaction } from "../db/helpers.js";
import { rescanPendingTransactionsForPlayer } from "../services/bank-import.js";
import { mapPlayer, type PlayerRow } from "../utils/mappers.js";
import { parseBody, parseUuidParam } from "../utils/request.js";
import { pool } from "../db/pool.js";
import { z } from "zod";
import { insertLedgerEntry } from "../services/ledger.js";
import { applyRetroactiveSplit } from "../services/ledger-rules.js";
import { recalculateAllBalances } from "../services/balance-recalc.js";
import { pairPaymentsToCharges, type ChargeEntry, type PaymentEntry } from "../services/payment-pairing.js";

export async function playerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/players", async (request) => {
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;
    const activeOnly = (request.query as any).active === 'true';

    const countQuery = activeOnly ? `SELECT COUNT(*)::text AS count FROM players WHERE active = true` : `SELECT COUNT(*)::text AS count FROM players`;
    const countResult = await query<{ count: string }>(countQuery);
    const total = Number(countResult.rows[0]?.count || 0);

    const cutoffResult = await query<{ cutoff_date: string | null }>(
      `SELECT cutoff_date::text FROM settings WHERE id = 1`
    );
    const cutoff = cutoffResult.rows[0]?.cutoff_date?.slice(0, 10) ?? null;

    const whereClause = activeOnly ? `WHERE p.active = true` : ``;
    const result = await query<PlayerRow & { last_game_date: string | null }>(
      `SELECT p.id, p.display_name, p.active, p.current_balance_cents, p.notes, p.created_at, p.updated_at,
              (SELECT MAX(g.game_date)::text FROM attendance a JOIN games g ON g.id = a.game_id WHERE a.player_id = p.id AND a.chargeable = true AND ($3::date IS NULL OR g.game_date >= $3)) AS last_game_date
       FROM players p
       ${whereClause}
       ORDER BY p.current_balance_cents DESC, p.display_name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset, cutoff]
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

  app.post("/api/players/:id/retroactive-split", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    
    const result = await withTransaction(async (client) => {
      return await applyRetroactiveSplit(client, id, recalculateAllBalances);
    });

    if (result.error) {
      throw app.httpErrors.badRequest(result.error);
    }

    return { 
      success: true, 
      appliedCount: result.appliedCount 
    };
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
    const body = parseBody(reply, PlayerAliasCreateSchema, request.body);

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

  app.post("/api/players/:id/manual-payment", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const bodySchema = z.object({
      amountCents: z.number().int().positive(),
      gameId: z.string().uuid().optional()
    });
    const body = parseBody(reply, bodySchema, request.body);

    const result = await withTransaction(async (client) => {
      let createdAt: Date | undefined;

      if (body.gameId) {
        const gameRes = await client.query<{ game_date: string }>(
          `SELECT game_date::text FROM games WHERE id = $1`,
          [body.gameId]
        );
        if (gameRes.rowCount > 0 && gameRes.rows[0]?.game_date) {
          const d = new Date(gameRes.rows[0].game_date);
          d.setDate(d.getDate() + 1); // 1 day after the game
          createdAt = d;
        }
      }

      const amountCents = -Math.abs(body.amountCents); // Payments are stored as negative amounts

      const entryId = await insertLedgerEntry(client, {
        playerId: id,
        type: "payment",
        amountCents,
        gameId: body.gameId ?? null,
        adjustmentReason: "Cash payment",
        createdAt
      });

      return { id: entryId };
    });

    reply.code(201);
    return { id: result.id, amountCents: body.amountCents, gameId: body.gameId };
  });

  app.delete("/api/players/:id/manual-payment/:entryId", async (request, reply) => {
    const playerId = parseUuidParam(request, reply, "id");
    const entryId = parseUuidParam(request, reply, "entryId");

    await withTransaction(async (client) => {
      // Find the entry and validate it's a manual payment
      const entryResult = await client.query<{ amount_cents: number; game_id: string | null; created_at: string; adjustment_reason: string }>(
        `SELECT amount_cents, game_id, created_at::text AS created_at, adjustment_reason
         FROM ledger_entries 
         WHERE id = $1 AND player_id = $2 
           AND type = 'payment' 
           AND bank_transaction_id IS NULL`,
        [entryId, playerId]
      );

      if (entryResult.rowCount === 0) {
        throw reply.notFound("Manual payment entry not found");
      }

      const entry = entryResult.rows[0]!;
      
      // Validate it's likely a manual cash payment. 
      // We look for "Cash payment" but also support descriptions from ManualAdjustmentForm like "Manual incoming payment"
      const isCashPayment = entry.adjustment_reason === 'Cash payment' || 
                            entry.adjustment_reason?.toLowerCase().includes('manual') ||
                            entry.adjustment_reason?.toLowerCase().includes('cash');

      if (!isCashPayment) {
        throw reply.forbidden(`Entry is not a manual cash payment (Reason: ${entry.adjustment_reason})`);
      }

      // Delete it
      await client.query(`DELETE FROM ledger_entries WHERE id = $1`, [entryId]);

      // Reverse the balance if it was applied (on/after cutoff)
      let effectiveDate: string | null = null;
      if (entry.game_id) {
        const gameResult = await client.query<{ game_date: string }>(
          `SELECT game_date::text FROM games WHERE id = $1`, 
          [entry.game_id]
        );
        effectiveDate = gameResult.rows[0]?.game_date?.slice(0, 10) ?? null;
      }
      if (!effectiveDate) {
        effectiveDate = entry.created_at.slice(0, 10);
      }

      const settings = await client.query<{ cutoff_date: string | null }>(
        `SELECT cutoff_date::text FROM settings WHERE id = 1`
      );
      const cutoffDate = settings.rows[0]?.cutoff_date?.slice(0, 10) ?? null;

      const isAfterCutoff = !cutoffDate || effectiveDate >= cutoffDate;

      if (isAfterCutoff) {
        // Reverse balance update. `amount_cents` is negative, so subtracting it increases the balance.
        await client.query(
          `UPDATE players 
           SET current_balance_cents = current_balance_cents - $1, updated_at = NOW() 
           WHERE id = $2`,
          [entry.amount_cents, playerId]
        );
      }
    });

    return { deleted: true };
  });

  app.get("/api/players/:id/ledger", async (request, reply) => {
    const id = parseUuidParam(request, reply, "id");
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;
    const showAll = (request.query as any).showAll === "true";

    const cutoffResult = await query<{ cutoff_date: string | null }>(
      `SELECT cutoff_date::text FROM settings WHERE id = 1`
    );
    const rawCutoff = cutoffResult.rows[0]?.cutoff_date?.slice(0, 10) ?? null;
    const cutoff = showAll ? null : rawCutoff;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
       WHERE le.player_id = $1
         AND ($2::date IS NULL OR COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) >= $2)`,
      [id, cutoff]
    );
    const total = Number(countResult.rows[0]?.count || 0);

    const result = await query<{
      id: string;
      player_id: string;
      type: string;
      amount_cents: number;
      created_at: Date;
      game_id: string | null;
      bank_transaction_id: string | null;
      game_date: string | null;
      bank_posted_at: string | null;
      adjustment_reason: string | null;
      bank_description: string | null;
    }>(
      `SELECT le.id, le.player_id, le.type, le.amount_cents, le.created_at, le.adjustment_reason,
              le.game_id, le.bank_transaction_id,
              g.game_date::text AS game_date,
              bt.posted_at_utc::text AS bank_posted_at,
              bt.description_raw AS bank_description
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
       WHERE le.player_id = $1
         AND ($2::date IS NULL OR COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) >= $2)
       ORDER BY COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) DESC
       LIMIT $3 OFFSET $4`,
      [id, cutoff, limit, offset]
    );

    // Fetch all entries for pairings
    const allEntriesResult = await query<{
      id: string;
      type: string;
      amount_cents: number;
      game_id: string | null;
      attendance_id: string | null;
      created_at: Date;
      game_date: string | null;
    }>(
      `SELECT le.id, le.type, le.amount_cents, le.game_id, le.attendance_id, le.created_at,
              g.game_date::text AS game_date
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       WHERE le.player_id = $1
         AND ($2::date IS NULL OR COALESCE(g.game_date, le.created_at::date) >= $2)
       ORDER BY le.created_at ASC`,
      [id, cutoff]
    );

    const charges: ChargeEntry[] = [];
    const payments: PaymentEntry[] = [];

    for (const entry of allEntriesResult.rows) {
      if (entry.type === "charge" && entry.game_id && entry.game_date) {
        charges.push({
          gameId: entry.game_id,
          attendanceId: entry.attendance_id ?? "",
          playerId: id,
          amountCents: entry.amount_cents,
          gameDate: entry.game_date,
        });
      } else if (entry.type === "payment") {
        payments.push({
          playerId: id,
          amountCents: Math.abs(entry.amount_cents),
          createdAt: entry.created_at.toISOString(),
          gameId: entry.game_id,
        });
      } else if (entry.type === "adjustment") {
        if (entry.amount_cents < 0) {
          payments.push({
            playerId: id,
            amountCents: Math.abs(entry.amount_cents),
            createdAt: entry.created_at.toISOString(),
            gameId: entry.game_id,
          });
        } else if (entry.amount_cents > 0) {
          charges.push({
            gameId: entry.game_id ?? "",
            attendanceId: entry.attendance_id ?? "",
            playerId: id,
            amountCents: entry.amount_cents,
            gameDate: entry.game_date ?? entry.created_at.toISOString().slice(0, 10),
          });
        }
      }
    }

    const pairings = pairPaymentsToCharges(charges, payments);
    const pairingMap = new Map(pairings.map((p) => [p.gameId, p]));

    const enrichedRows = result.rows.map((row) => {
      if (row.type === "charge" && row.game_id) {
        const pairing = pairingMap.get(row.game_id);
        const outstandingCents = pairing ? (pairing.chargeCents - pairing.paidCents) : row.amount_cents;
        return {
          ...row,
          paymentStatus: pairing?.status ?? "unpaid",
          outstandingCents,
        };
      }
      if (row.type === "payment") {
        const isManualPayment = row.adjustment_reason === 'Cash payment' && row.bank_transaction_id === null;
        return {
          ...row,
          isManualPayment,
        };
      }
      return row;
    });

    return {
      data: enrichedRows,
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

      // Verify target player exists
      const targetCheck = await client.query<{ id: string }>(
        `SELECT id FROM players WHERE id = $1`,
        [targetPlayerId]
      );
      if (targetCheck.rowCount === 0) {
        throw reply.notFound("Target player not found");
      }

      // Verify all source players exist
      const sourcePlaceholders = sourcePlayerIds.map((_, i) => `$${i + 1}`).join(", ");
      const sourceCheck = await client.query<{ id: string }>(
        `SELECT id FROM players WHERE id IN (${sourcePlaceholders})`,
        sourcePlayerIds
      );
      if ((sourceCheck.rowCount ?? 0) < sourcePlayerIds.length) {
        throw reply.notFound("One or more source players not found");
      }

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

      // Recalculate target balance by summarizing qualifying ledger entries
      const cutoffResult = await client.query<{ cutoff_date: string | null }>(
        `SELECT cutoff_date::text FROM settings WHERE id = 1`
      );
      const cutoff = cutoffResult.rows[0]?.cutoff_date?.slice(0, 10) ?? null;

      await client.query(`
        UPDATE players
        SET current_balance_cents = COALESCE((
          SELECT SUM(le.amount_cents)
          FROM ledger_entries le
          LEFT JOIN games g ON g.id = le.game_id
          LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
          WHERE le.player_id = $1
            AND ($2::date IS NULL OR COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) >= $2)
        ), 0)
        WHERE id = $1
      `, [targetPlayerId, cutoff]);

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
