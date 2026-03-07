import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FeeUpdateSchema, CutoffDateUpdateSchema } from "@fiveaside/contracts";
import { query, withTransaction } from "../db/helpers.js";
import { parseBody } from "../utils/request.js";
import { toIso, toDateString } from "../utils/mappers.js";
import { recalculateAllBalances } from "../services/balance-recalc.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/settings", async () => {
    const settingsResult = await query<{ current_game_fee_cents: number; app_timezone: string; cutoff_date: Date | string | null; updated_at: Date | string }>(
      `SELECT current_game_fee_cents, app_timezone, cutoff_date, updated_at
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
        cutoffDate: settings.cutoff_date ? toDateString(settings.cutoff_date) : null,
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
    const adminId = request.admin.id;

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
        [oldFee, body.newFeeCents, adminId]
      );
      return { oldFee, newFee: body.newFeeCents, changed: true };
    });

    return result;
  });

  app.patch("/api/settings/cutoff-date", async (request, reply) => {
    const body = parseBody(reply, CutoffDateUpdateSchema, request.body);

    const result = await withTransaction(async (client) => {
      const current = await client.query<{ cutoff_date: Date | string | null }>(
        `SELECT cutoff_date FROM settings WHERE id = 1 FOR UPDATE`
      );
      const oldCutoff = current.rows[0]!.cutoff_date;
      const oldStr = oldCutoff ? toDateString(oldCutoff) : null;

      if (oldStr === body.cutoffDate) {
        return { changed: false, cutoffDate: body.cutoffDate };
      }

      await client.query(
        `UPDATE settings SET cutoff_date = $1, updated_at = NOW() WHERE id = 1`,
        [body.cutoffDate]
      );

      await recalculateAllBalances(client, body.cutoffDate);

      return { changed: true, cutoffDate: body.cutoffDate };
    });

    return result;
  });
}
