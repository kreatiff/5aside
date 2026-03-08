import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatCurrency } from "../utils/format";

type GameCell = {
  gameId: string;
  status: "paid" | "partial" | "unpaid";
  chargeCents: number;
  paidCents: number;
} | null;

type MatrixPlayer = {
  id: string;
  displayName: string;
  hasPreCutoffCredit: boolean;
  cells: GameCell[];
};

type MatrixGame = {
  id: string;
  gameDate: string;
  feeCents: number;
};

type MatrixResponse = {
  games: MatrixGame[];
  players: MatrixPlayer[];
};

const MONTH_OPTIONS = [
  { value: 2, label: "2 months" },
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
];

export const PaymentMatrixPage = () => {
  const [months, setMonths] = useState(3);
  const navigate = useNavigate();

  const { data: matrix, isLoading } = useQuery({
    queryKey: ["payment-matrix", months],
    queryFn: async () => {
      const { data } = await api.get<MatrixResponse>(
        `/payment-matrix?months=${months}`,
      );
      return data;
    },
  });

  const games = matrix?.games ?? [];
  const players = matrix?.players ?? [];

  // Per-game summary row
  const gameSummaries = useMemo(() => {
    if (!games.length || !players.length) return [];
    return games.map((_game, gi) => {
      let totalExpected = 0;
      let totalPaid = 0;
      for (const player of players) {
        const cell = player.cells[gi];
        if (cell) {
          totalExpected += cell.chargeCents;
          totalPaid += cell.paidCents;
        }
      }
      const pct =
        totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;
      return { totalExpected, totalPaid, pct };
    });
  }, [games, players]);

  return (
    <>
      <PageHeader
        title="Payment Matrix"
        actions={
          <select
            className="input-field"
            style={{ width: "auto", minWidth: 140 }}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {MONTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Last {o.label}
              </option>
            ))}
          </select>
        }
      />

      {isLoading ? (
        <div className="card">
          <div
            className="skeleton"
            style={{ width: "100%", height: 300, borderRadius: 8 }}
          />
        </div>
      ) : games.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: "var(--spacing-xl)" }}
        >
          <p className="text-muted">No games found in the selected period.</p>
        </div>
      ) : (
        <div className="card payment-matrix-wrapper">
          <div className="payment-matrix-scroll">
            <table className="payment-matrix">
              <thead>
                <tr>
                  <th className="payment-matrix__player-cell payment-matrix__header-cell">
                    Player
                  </th>
                  {games.map((game) => (
                    <th
                      key={game.id}
                      className="payment-matrix__header-cell"
                      title={`Fee: ${formatCurrency(game.feeCents)}`}
                    >
                      {formatDate(game.gameDate)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.id}>
                    <td className="payment-matrix__player-cell">
                      <span
                        className="text-link"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/players/${player.id}`)}
                      >
                        {player.displayName}
                      </span>
                      {player.hasPreCutoffCredit && (
                        <span
                          className="payment-matrix__credit-flag"
                          title="Player has credit from before the cutoff date"
                        >
                          *
                        </span>
                      )}
                    </td>
                    {player.cells.map((cell, gi) => {
                      if (!cell) {
                        return (
                          <td
                            key={games[gi]!.id}
                            className="payment-matrix__cell payment-matrix__cell--absent"
                          />
                        );
                      }
                      const statusClass = `payment-matrix__cell--${cell.status}`;
                      const tooltip =
                        cell.status === "paid"
                          ? `Paid: ${formatCurrency(cell.paidCents)}`
                          : cell.status === "partial"
                            ? `${formatCurrency(cell.paidCents)} / ${formatCurrency(cell.chargeCents)}`
                            : `Unpaid: ${formatCurrency(cell.chargeCents)}`;
                      return (
                        <td
                          key={games[gi]!.id}
                          className={`payment-matrix__cell ${statusClass}`}
                          title={tooltip}
                          onClick={() => navigate(`/games/${cell.gameId}`)}
                        >
                          <span className="payment-matrix__cell-icon">
                            {cell.status === "paid"
                              ? "✓"
                              : cell.status === "partial"
                                ? "½"
                                : "✗"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Summary row */}
                {gameSummaries.length > 0 && (
                  <tr className="payment-matrix__summary-row">
                    <td className="payment-matrix__player-cell payment-matrix__summary-label">
                      Collection %
                    </td>
                    {gameSummaries.map((summary, gi) => (
                      <td
                        key={games[gi]!.id}
                        className="payment-matrix__cell payment-matrix__summary-cell"
                        title={`${formatCurrency(summary.totalPaid)} / ${formatCurrency(summary.totalExpected)}`}
                      >
                        <span
                          className={
                            summary.pct >= 100
                              ? "text-success"
                              : summary.pct > 0
                                ? "text-warning"
                                : "text-danger"
                          }
                          style={{
                            fontWeight: 600,
                            fontSize: "var(--font-sm)",
                          }}
                        >
                          {summary.pct}%
                        </span>
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};
