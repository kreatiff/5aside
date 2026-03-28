import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { formatCurrency } from "../utils/format";

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

/** Format a date string into "OCT 12" style */
function formatMatrixDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

/** Compute the outstanding balance for a player across all cells */
function computeOutstanding(cells: GameCell[]): number {
  return cells.reduce((sum, cell) => {
    if (!cell) return sum;
    return sum + Math.max(0, cell.chargeCents - cell.paidCents);
  }, 0);
}

const PaidIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="Paid">
    <path
      d="M3 8L6.5 11.5L13 4.5"
      stroke="#22c55e"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const UnpaidIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-label="Unpaid"
  >
    <path
      d="M1 1L13 13M13 1L1 13"
      stroke="#ef4444"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const PartialIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-label="Partial"
  >
    <circle cx="8" cy="8" r="6.5" stroke="#f59e0b" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2.5" fill="#f59e0b" />
  </svg>
);

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

  const totalOutstanding = useMemo(() => {
    return players.reduce(
      (sum, player) => sum + computeOutstanding(player.cells),
      0,
    );
  }, [players]);

  return (
    <>
      <PageHeader
        title="Payment Matrix"
        description="Player payment status across recent games."
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
        <div className="skeleton" style={{ width: "100%", height: 300 }} />
      ) : games.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "var(--spacing-xl)",
            color: "var(--text-muted)",
          }}
        >
          No games found in the selected period.
        </div>
      ) : (
        <>
          {/* Mobile list view — shown only on mobile via CSS */}
          <div className="payment-matrix-mobile-list">
            <div style={{ padding: "var(--spacing-sm) var(--spacing-md)", borderBottom: "1px solid var(--border-subtle)", marginBottom: "var(--spacing-xs)" }}>
              <span className="text-muted" style={{ fontSize: "var(--font-xs)" }}>
                Full payment matrix available on desktop. Showing player balances.
              </span>
            </div>
            {players
              .slice()
              .sort((a, b) => computeOutstanding(b.cells) - computeOutstanding(a.cells))
              .map((player) => {
                const outstanding = computeOutstanding(player.cells);
                const paidCount = player.cells.filter((c) => c?.status === "paid").length;
                const partialCount = player.cells.filter((c) => c?.status === "partial").length;
                const unpaidCount = player.cells.filter((c) => c?.status === "unpaid").length;
                return (
                  <div
                    key={player.id}
                    className="pm-mobile-player-row"
                    onClick={() => navigate(`/players/${player.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/players/${player.id}`); }}
                  >
                    <div>
                      <div className="pm-mobile-player-name">{player.displayName}</div>
                      <div className="pm-mobile-player-meta">
                        <span style={{ color: "var(--success)" }}>{paidCount}✓</span>
                        {partialCount > 0 && <span style={{ color: "var(--warning)" }}>{partialCount}◐</span>}
                        {unpaidCount > 0 && <span style={{ color: "var(--danger)" }}>{unpaidCount}✗</span>}
                      </div>
                    </div>
                    {outstanding > 0 && (
                      <span className="pm-mobile-outstanding">−{formatCurrency(outstanding)}</span>
                    )}
                    {outstanding === 0 && (
                      <span style={{ fontSize: "var(--font-sm)", color: "var(--success)", fontWeight: 600 }}>✓ Clear</span>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Desktop/tablet matrix — hidden on mobile via CSS */}
          <div className="payment-matrix-container">
            <div className="payment-matrix-scroll-v2">
            <table className="payment-matrix-v2">
              <thead>
                <tr>
                  {/* Player column header */}
                  <th className="pm-header-cell pm-header-cell--player">
                    <span className="pm-header-label">PLAYER</span>
                  </th>

                  {/* Total column header */}
                  <th className="pm-header-cell pm-header-cell--total">
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: "2px",
                      }}
                    >
                      <span className="pm-header-label">Total</span>
                      <span className="pm-game-header-day">Balance</span>
                    </div>
                  </th>

                  {/* Game column headers */}
                  {games.map((game) => (
                    <th key={game.id} className="pm-header-cell">
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "2px",
                        }}
                      >
                        <span className="pm-game-header-date">
                          {formatMatrixDate(game.gameDate)}
                        </span>

                        <span className="pm-game-header-fee">
                          {formatCurrency(game.feeCents)}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {players.map((player) => {
                  const outstanding = computeOutstanding(player.cells);
                  return (
                    <tr key={player.id}>
                      {/* Player name cell */}
                      <td className="pm-cell pm-cell--player">
                        <div className="pm-player-info">
                          <span
                            className="pm-player-name"
                            onClick={() => navigate(`/players/${player.id}`)}
                          >
                            {player.displayName}
                          </span>
                          {player.hasPreCutoffCredit && (
                            <span
                              style={{
                                color: "var(--primary)",
                                marginLeft: "2px",
                                cursor: "help",
                                fontWeight: 700,
                              }}
                              title="Has pre-cutoff credit"
                            >
                              *
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Total balance cell */}
                      <td className="pm-cell pm-cell--total">
                        <span
                          style={{
                            color:
                              outstanding > 0
                                ? "var(--danger)"
                                : "var(--text-muted)",
                          }}
                          className="pm-percentage-text"
                        >
                          {formatCurrency(outstanding)}
                        </span>
                      </td>

                      {/* Game cells */}
                      {player.cells.map((cell, gi) => {
                        if (!cell) {
                          return (
                            <td key={games[gi]!.id} className="pm-cell">
                              <span
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "14px",
                                  lineHeight: 1,
                                }}
                              >
                                —
                              </span>
                            </td>
                          );
                        }

                        const tooltip =
                          cell.status === "paid"
                            ? `Paid: ${formatCurrency(cell.paidCents)}`
                            : cell.status === "partial"
                              ? `${formatCurrency(cell.paidCents)} / ${formatCurrency(cell.chargeCents)}`
                              : `Unpaid: ${formatCurrency(cell.chargeCents)}`;

                        return (
                          <td
                            key={games[gi]!.id}
                            className="pm-cell pm-cell--clickable"
                            title={tooltip}
                            onClick={() => navigate(`/games/${cell.gameId}`)}
                          >
                            <span className="pm-icon-wrapper">
                              {cell.status === "paid" ? (
                                <PaidIcon />
                              ) : cell.status === "partial" ? (
                                <PartialIcon />
                              ) : (
                                <UnpaidIcon />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Summary / Collection rate row */}
                {gameSummaries.length > 0 && (
                  <tr className="pm-summary-row">
                    <td className="pm-summary-label">COLLECTION RATE</td>

                    {/* Total balance summary */}
                    <td className="pm-summary-total-cell">
                      <span
                        style={{
                          color:
                            totalOutstanding > 0
                              ? "var(--danger)"
                              : "var(--success)",
                        }}
                        className="pm-total-amount"
                      >
                        {formatCurrency(totalOutstanding)}
                      </span>
                    </td>

                    {gameSummaries.map((summary, gi) => (
                      <td
                        key={games[gi]!.id}
                        className="pm-cell"
                        style={{ cursor: "default", borderBottom: "none" }}
                        title={`${formatCurrency(summary.totalPaid)} / ${formatCurrency(summary.totalExpected)}`}
                      >
                        <span
                          style={{
                            color:
                              summary.pct >= 100
                                ? "var(--success)"
                                : summary.pct >= 70
                                  ? "var(--warning)"
                                  : "var(--danger)",
                          }}
                          className="pm-percentage-text"
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
        </>
      )}
    </>
  );
};
