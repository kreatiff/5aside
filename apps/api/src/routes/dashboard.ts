import type { FastifyInstance } from "fastify";
import { query } from "../db/helpers.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/dashboard/summary", async () => {
    const playersResult = await query<{ total_players: string; active_players: string }>(
      `SELECT COUNT(*)::text AS total_players, 
              SUM(CASE WHEN active THEN 1 ELSE 0 END)::text AS active_players 
       FROM players`
    );
    
    const balanceResult = await query<{ total_outstanding_cents: string }>(
      `SELECT SUM(current_balance_cents)::text AS total_outstanding_cents 
       FROM players 
       WHERE current_balance_cents < 0`
    );

    const gamesResult = await query<{ games_this_month: string; games_total: string }>(
      `SELECT COUNT(*)::text AS games_total,
              SUM(CASE WHEN game_date >= date_trunc('month', current_date) THEN 1 ELSE 0 END)::text AS games_this_month
       FROM games`
    );

    return {
      summary: {
        totalPlayers: Number(playersResult.rows[0]?.total_players || 0),
        activePlayers: Number(playersResult.rows[0]?.active_players || 0),
        totalOutstandingCents: Number(balanceResult.rows[0]?.total_outstanding_cents || 0),
        gamesThisMonth: Number(gamesResult.rows[0]?.games_this_month || 0),
        gamesTotal: Number(gamesResult.rows[0]?.games_total || 0)
      }
    };
  });

  app.get("/api/dashboard/finance", async (request) => {
    const months = Number((request.query as any).months) || 6;
    
    const result = await query<{ month: string; total_charges_cents: string; total_payments_cents: string }>(
      `SELECT 
         to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
         SUM(CASE WHEN type = 'charge' THEN amount_cents ELSE 0 END)::text AS total_charges_cents,
         SUM(CASE WHEN type = 'payment' THEN ABS(amount_cents) ELSE 0 END)::text AS total_payments_cents
       FROM ledger_entries
       WHERE created_at >= date_trunc('month', current_date - interval '${months} months')
       GROUP BY date_trunc('month', created_at)
       ORDER BY month ASC`
    );

    return {
      finance: result.rows.map(row => ({
        month: row.month,
        totalChargesCents: Number(row.total_charges_cents || 0),
        totalPaymentsCents: Number(row.total_payments_cents || 0),
        netCents: Number(row.total_charges_cents || 0) - Number(row.total_payments_cents || 0)
      }))
    };
  });

  app.get("/api/dashboard/attendance", async (request) => {
    const limit = Number((request.query as any).limit) || 10;
    
    const result = await query<{ game_date: string; total_attendees: string; chargeable_attendees: string }>(
      `SELECT 
         to_char(g.game_date, 'YYYY-MM-DD') AS game_date,
         COUNT(a.id)::text AS total_attendees,
         SUM(CASE WHEN a.chargeable THEN 1 ELSE 0 END)::text AS chargeable_attendees
       FROM games g
       LEFT JOIN attendance a ON a.game_id = g.id
       GROUP BY g.id, g.game_date, g.kickoff_at_utc
       ORDER BY g.game_date DESC, g.kickoff_at_utc DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    return {
      attendance: result.rows.map(row => ({
        gameDate: row.game_date,
        totalAttendees: Number(row.total_attendees || 0),
        chargeableAttendees: Number(row.chargeable_attendees || 0)
      })).reverse() // Return chronological for charts
    };
  });
}
