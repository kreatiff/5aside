import type { FastifyInstance } from "fastify";
import { query } from "../db/helpers.js";

async function getCutoffDate(): Promise<string | null> {
  const result = await query<{ cutoff_date: string | null }>(
    `SELECT cutoff_date::text FROM settings WHERE id = 1`
  );
  return result.rows[0]?.cutoff_date?.slice(0, 10) ?? null;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/dashboard/summary", async () => {
    const cutoff = await getCutoffDate();

    const playersResult = await query<{ total_players: string; active_players: string }>(
      `SELECT COUNT(*)::text AS total_players,
              SUM(CASE WHEN active THEN 1 ELSE 0 END)::text AS active_players
       FROM players`
    );

    const balanceResult = await query<{ total_outstanding_cents: string }>(
      `SELECT SUM(current_balance_cents)::text AS total_outstanding_cents
       FROM players
       WHERE current_balance_cents > 0`
    );

    const gamesResult = await query<{ games_this_month: string; games_total: string }>(
      `SELECT COUNT(*)::text AS games_total,
              SUM(CASE WHEN game_date >= date_trunc('month', current_date) THEN 1 ELSE 0 END)::text AS games_this_month
       FROM games
       WHERE ($1::date IS NULL OR game_date >= $1)`,
      [cutoff]
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
    const cutoff = await getCutoffDate();

    const result = await query<{ month: string; total_charges_cents: string; total_payments_cents: string }>(
      `SELECT
         to_char(date_trunc('month', COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date)), 'YYYY-MM') AS month,
         SUM(CASE WHEN le.type = 'charge' THEN le.amount_cents ELSE 0 END)::text AS total_charges_cents,
         SUM(CASE WHEN le.type = 'payment' THEN ABS(le.amount_cents) ELSE 0 END)::text AS total_payments_cents
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
       WHERE COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) >= date_trunc('month', current_date - interval '${months} months')
         AND ($1::date IS NULL OR COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) >= $1)
       GROUP BY date_trunc('month', COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date))
       ORDER BY month ASC`,
      [cutoff]
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
    const cutoff = await getCutoffDate();

    const result = await query<{ game_date: string; total_attendees: string; chargeable_attendees: string }>(
      `SELECT
         to_char(g.game_date, 'YYYY-MM-DD') AS game_date,
         COUNT(a.id)::text AS total_attendees,
         SUM(CASE WHEN a.chargeable THEN 1 ELSE 0 END)::text AS chargeable_attendees
       FROM games g
       LEFT JOIN attendance a ON a.game_id = g.id
       WHERE ($1::date IS NULL OR g.game_date >= $1)
       GROUP BY g.id, g.game_date, g.kickoff_at_utc
       ORDER BY g.game_date DESC, g.kickoff_at_utc DESC NULLS LAST
       LIMIT $2`,
      [cutoff, limit]
    );

    return {
      attendance: result.rows.map(row => ({
        gameDate: row.game_date,
        totalAttendees: Number(row.total_attendees || 0),
        chargeableAttendees: Number(row.chargeable_attendees || 0)
      })).reverse()
    };
  });
}
