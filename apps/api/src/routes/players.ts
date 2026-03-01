import type { FastifyInstance } from "fastify";
import { PlayerCreateSchema, PlayerUpdateSchema, PlayerAliasCreateSchema } from "@fiveaside/contracts";
import { normalizeName } from "@fiveaside/recon";
import { query } from "../db/helpers.js";
import { mapPlayer, type PlayerRow } from "../utils/mappers.js";
import { parseBody, parseUuidParam } from "../utils/request.js";

export async function playerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/players", async (request) => {
    const limit = Number((request.query as any).limit) || 50;
    const offset = Number((request.query as any).offset) || 0;

    const countResult = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM players`);
    const total = Number(countResult.rows[0]?.count || 0);

    const result = await query<PlayerRow>(
      `SELECT id, display_name, active, current_balance_cents, notes, created_at, updated_at
       FROM players
       ORDER BY display_name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { 
      data: result.rows.map(mapPlayer),
      total,
      limit,
      offset
    };
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
    return { aliases: result.rows };
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
    }>(
      `SELECT id, player_id, type, amount_cents, created_at
       FROM ledger_entries
       WHERE player_id = $1
       ORDER BY created_at DESC
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
}
