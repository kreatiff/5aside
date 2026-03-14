import { describe, expect, it, vi } from "vitest";
import { calculateGamePaymentStatus } from "./games.js";
import { query } from "../db/helpers.js";

vi.mock("../db/helpers.js", () => ({
  query: vi.fn(),
}));

describe("games service", () => {
  describe("calculateGamePaymentStatus", () => {
    it("returns correct payment statuses for players", async () => {
      const gameId = "game-1";
      
      // Mock game fee
      (query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ fee_cents: 1000, status: "synced", game_date: "2026-03-01" }],
      });

      // Mock cutoff date
      (query as any).mockResolvedValueOnce({
        rows: [{ cutoff_date: "2026-01-01" }],
      });

      // Mock attendees
      (query as any).mockResolvedValueOnce({
        rows: [
          { player_id: "p1", display_name: "Paid Player" },
          { player_id: "p2", display_name: "Unpaid Player" },
        ],
      });

      // Mock ledger entries
      (query as any).mockResolvedValueOnce({
        rows: [
          // Charge for p1
          { player_id: "p1", type: "charge", amount_cents: 1000, game_id: "game-1", game_date: "2026-03-01", created_at: "2026-03-01T10:00:00Z" },
          // Payment for p1
          { player_id: "p1", type: "payment", amount_cents: -1000, game_id: "game-1", created_at: "2026-03-01T11:00:00Z" },
          // Charge for p2
          { player_id: "p2", type: "charge", amount_cents: 1000, game_id: "game-1", game_date: "2026-03-01", created_at: "2026-03-01T10:00:00Z" },
        ],
      });

      const result = await calculateGamePaymentStatus(gameId);

      expect(result.gameId).toBe(gameId);
      expect(result.gameDate).toBe("2026-03-01");
      expect(result.feeCents).toBe(1000);
      expect(result.playerStatuses).toHaveLength(2);
      
      const p1Status = result.playerStatuses.find(p => p.playerId === "p1");
      expect(p1Status?.status).toBe("paid");
      expect(p1Status?.paidCents).toBe(1000);

      const p2Status = result.playerStatuses.find(p => p.playerId === "p2");
      expect(p2Status?.status).toBe("unpaid");
      expect(p2Status?.paidCents).toBe(0);

      expect(result.summary.paidCount).toBe(1);
      expect(result.summary.unpaidCount).toBe(1);
    });
  });
});
