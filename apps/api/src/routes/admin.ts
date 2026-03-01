import type { FastifyInstance } from "fastify";
import { query } from "../db/helpers.js";

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/admin/ledger-integrity", async () => {
    const result = await query<{
      player_id: string;
      display_name: string;
      cached_balance: number;
      calculated_balance: string;
    }>(
      `SELECT 
         p.id AS player_id,
         p.display_name,
         p.current_balance_cents AS cached_balance,
         COALESCE(SUM(l.amount_cents), 0)::text AS calculated_balance
       FROM players p
       LEFT JOIN ledger_entries l ON l.player_id = p.id
       GROUP BY p.id, p.display_name, p.current_balance_cents
       HAVING p.current_balance_cents != COALESCE(SUM(l.amount_cents), 0)`
    );

    if (result.rowCount === 0) {
      return { healthy: true, mismatches: [] };
    }

    return {
      healthy: false,
      mismatches: result.rows.map(row => ({
        playerId: row.player_id,
        displayName: row.display_name,
        cachedBalance: row.cached_balance,
        calculatedBalance: Number(row.calculated_balance)
      }))
    };
  });
}
