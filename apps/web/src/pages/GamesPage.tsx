import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, Calendar as CalendarIcon, Layers } from "lucide-react";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { useToast } from "../contexts/ToastContext";
import { formatDate, formatCurrency } from "../utils/format";

type Game = {
  id: string;
  gameDate: string;
  kickoff_at_utc?: string | null;
  status: string;
  feeCents: number;
  attendanceCount?: number;
  totalExpectedCents: number;
  totalPaidCents: number;
  source: string;
  facebookEventUrl?: string | null;
};

function getStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "synced":
      return "success";
    case "cancelled":
      return "danger";
    case "pending":
      return "warning";
    case "scheduled":
      return "info";
    default:
      return "neutral";
  }
}

const FB_EVENT_URL_REGEX = /facebook\.com\/events\/\d+/;

const columns: Column<Game>[] = [
  {
    key: "gameDate",
    header: "DATE & TIME",
    sortable: true,
    sortValue: (game) => game.gameDate,
    mobileTitle: true,
    render: (game) => {
      const date = new Date(game.gameDate + "T00:00:00Z");
      const formattedDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
      const time = game.kickoff_at_utc
        ? new Date(game.kickoff_at_utc).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";

      return (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 500 }}>{formattedDate}</span>
          <span
            style={{
              fontFamily: "var(--font-family-mono)",
              fontSize: "11px",
              color: "var(--text-muted)",
              letterSpacing: "0.02em",
            }}
          >
            {time}
          </span>
        </div>
      );
    },
  },
  {
    key: "attendanceCount",
    header: "PLAYERS",
    align: "center",
    render: (game) => (
      <div
        style={{
          textAlign: "center",
          fontWeight: 500,
          color: "var(--text-secondary)",
        }}
      >
        {game.attendanceCount || 0}
      </div>
    ),
  },
  {
    key: "totalExpectedCents",
    header: "EXPECTED",
    align: "right",
    render: (game) => (
      <div style={{ textAlign: "right" }}>
        <CurrencyDisplay
          cents={game.totalExpectedCents}
          size="sm"
          colorCode={false}
        />
      </div>
    ),
  },
  {
    key: "totalPaidCents",
    header: "COLLECTED",
    align: "right",
    render: (game) => (
      <div style={{ textAlign: "right" }}>
        <CurrencyDisplay
          cents={game.totalPaidCents}
          size="sm"
          colorCode={
            game.totalPaidCents < game.totalExpectedCents &&
            game.totalPaidCents > 0
          }
        />
      </div>
    ),
  },
  {
    key: "syncStatus",
    header: "SYNC",
    render: (game) => {
      const today = new Date().toISOString().slice(0, 10);
      const isPast = game.gameDate < today;

      let label: string;
      let variant: "success" | "warning" | "danger" | "info" | "neutral";
      switch (game.status) {
        case "synced":
          label = "Synced";
          variant = "success";
          break;
        case "cancelled":
          label = "Cancelled";
          variant = "neutral";
          break;
        case "scheduled":
          label = "Scheduled";
          variant = "info";
          break;
        case "pending":
          // A past game still 'pending' never received its attendance — this is
          // the actionable "the Facebook sync skipped this game" state.
          label = isPast ? "Needs sync" : "Scheduled";
          variant = isPast ? "danger" : "info";
          break;
        default:
          label = game.status;
          variant = "neutral";
      }

      return (
        <StatusBadge variant={variant} dot>
          {label}
        </StatusBadge>
      );
    },
  },
  {
    key: "paymentStatus",
    header: "PAYMENT",
    render: (game) => {
      // Cancelled games and games with nothing charged have no payment to track.
      if (game.status === "cancelled" || game.totalExpectedCents <= 0) {
        return (
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            —
          </span>
        );
      }

      const pct = Math.round(
        (game.totalPaidCents / game.totalExpectedCents) * 100,
      );
      const today = new Date().toISOString().slice(0, 10);
      const isPast = game.gameDate < today;

      let statusLabel: string;
      let statusColor: string;
      let squareColor: string;
      if (pct >= 100) {
        statusLabel = "SETTLED";
        statusColor = "var(--primary)";
        squareColor = "var(--primary)";
      } else if (pct > 0) {
        statusLabel = `PARTIAL (${pct}%)`;
        statusColor = "var(--warning)";
        squareColor = "var(--warning)";
      } else if (isPast) {
        statusLabel = "OVERDUE";
        statusColor = "var(--danger)";
        squareColor = "var(--danger)";
      } else {
        // Charged but not yet due (future game).
        statusLabel = "UNPAID";
        statusColor = "var(--text-muted)";
        squareColor = "#e5e7eb";
      }

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: "140px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                backgroundColor: squareColor,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: statusColor,
                letterSpacing: "0.05em",
              }}
            >
              {statusLabel}
            </span>
          </div>
          {pct < 100 && game.totalExpectedCents > 0 && (
            <div
              style={{
                width: "100%",
                height: "2px",
                backgroundColor: "var(--bg-base)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  backgroundColor: squareColor,
                }}
              />
            </div>
          )}
        </div>
      );
    },
  },
];

type BatchFrequency = "weekly" | "fortnightly" | "monthly";

type BatchPreviewItem = {
  date: string;
  url: string;
  status: "scheduled" | "pending";
  valid: boolean;
};

export const GamesPage = () => {
  const [showGameModal, setShowGameModal] = useState(false);
  const [newGameDate, setNewGameDate] = useState(
    new Date().toISOString().substring(0, 10),
  );
  const [newGameFee, setNewGameFee] = useState("");

  // Batch create state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchStartDate, setBatchStartDate] = useState(
    new Date().toISOString().substring(0, 10),
  );
  const [batchFrequency, setBatchFrequency] =
    useState<BatchFrequency>("weekly");
  const [batchUrls, setBatchUrls] = useState("");

  // Batch update state
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(
    new Set(),
  );
  const [showBatchUpdateModal, setShowBatchUpdateModal] = useState(false);
  const [newBatchFee, setNewBatchFee] = useState("");

  const [currentTab, setCurrentTab] = useState<"past" | "future">("past");
  const [showAllPast, setShowAllPast] = useState(false);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data } = await api.get(`/games?limit=10000`);
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await api.get("/settings");
      return data;
    },
  });

  const { data: venueSummary } = useQuery({
    queryKey: ["games", "venue-summary"],
    queryFn: async () => {
      const { data } = await api.get("/games/venue-summary");
      return data as {
        totalVenueFeeCents: number;
        totalVenuePaidCents: number;
        outstandingCents: number;
        gameCount: number;
      };
    },
  });

  const createGameMutation = useMutation({
    mutationFn: async ({
      gameDate,
      feeCents,
    }: {
      gameDate: string;
      feeCents: number;
    }) => {
      const { data } = await api.post("/games", {
        gameDate,
        feeCents,
        source: "manual",
        status: "pending",
      });
      return data;
    },
    onSuccess: (newGame) => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("success", "Game created successfully");
      navigate(`/games/${newGame.id}`);
    },
  });

  const batchCreateMutation = useMutation({
    mutationFn: async (input: {
      startDate: string;
      frequency: BatchFrequency;
      facebookEventUrls: string[];
    }) => {
      const { data } = await api.post("/games/batch", input);
      return data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast(
        "success",
        `Created ${result.summary.total} games (${result.summary.scheduled} scheduled, ${result.summary.pending} pending)`,
      );
      setShowBatchModal(false);
      setBatchUrls("");
    },
    onError: () => {
      addToast("error", "Failed to create games. Check for duplicate URLs.");
    },
  });

  const batchUpdateMutation = useMutation({
    mutationFn: async () => {
      if (newBatchFee === "" || isNaN(Number(newBatchFee))) return;
      const { data } = await api.patch("/games/batch", {
        gameIds: Array.from(selectedGameIds),
        feeCents: Number(newBatchFee),
      });
      return data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const successful = result.updated.filter(
        (r: { success: boolean }) => r.success,
      ).length;
      const failed = result.updated.filter(
        (r: { success: boolean }) => !r.success,
      ).length;
      if (failed > 0) {
        addToast(
          "info",
          `Updated ${successful} games, ${failed} failed (locked or not found)`,
        );
      } else {
        addToast("success", `Updated ${successful} games`);
      }
      setShowBatchUpdateModal(false);
      setSelectedGameIds(new Set());
      setNewBatchFee("");
    },
    onError: () => {
      addToast("error", "Failed to update games");
    },
  });

  const handleCreateGame = () => {
    const defaultFee = settings?.current_game_fee_cents || 1000;
    setNewGameDate(new Date().toISOString().substring(0, 10));
    setNewGameFee(defaultFee.toString());
    setShowGameModal(true);
  };

  const submitGame = () => {
    if (newGameDate.trim() && newGameFee !== "" && !isNaN(Number(newGameFee))) {
      createGameMutation.mutate({
        gameDate: newGameDate.trim(),
        feeCents: Number(newGameFee),
      });
    }
  };

  // Batch preview computation
  const batchPreview = useMemo((): BatchPreviewItem[] => {
    const urls = batchUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0 || !batchStartDate) return [];

    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(batchStartDate + "T00:00:00Z");

    return urls.map((url, i) => {
      const d = new Date(start);
      switch (batchFrequency) {
        case "weekly":
          d.setDate(d.getDate() + i * 7);
          break;
        case "fortnightly":
          d.setDate(d.getDate() + i * 14);
          break;
        case "monthly": {
          d.setMonth(d.getMonth() + i);
          const targetMonth = (start.getMonth() + i) % 12;
          if (d.getMonth() !== targetMonth) {
            d.setDate(0);
          }
          break;
        }
      }
      const dateStr = d.toISOString().slice(0, 10);
      return {
        date: dateStr,
        url,
        status:
          dateStr >= today ? ("scheduled" as const) : ("pending" as const),
        valid: FB_EVENT_URL_REGEX.test(url),
      };
    });
  }, [batchUrls, batchStartDate, batchFrequency]);

  const allUrlsValid =
    batchPreview.length > 0 && batchPreview.every((item) => item.valid);
  const scheduledCount = batchPreview.filter(
    (i) => i.status === "scheduled",
  ).length;
  const pendingCount = batchPreview.filter(
    (i) => i.status === "pending",
  ).length;

  const handleBatchSubmit = () => {
    if (!allUrlsValid) return;
    batchCreateMutation.mutate({
      startDate: batchStartDate,
      frequency: batchFrequency,
      facebookEventUrls: batchPreview.map((i) => i.url),
    });
  };

  const games: Game[] = data?.data ?? [];
  const today = new Date().toISOString().split("T")[0];

  const { pastGames, futureGames } = useMemo(() => {
    return games.reduce(
      (acc, game) => {
        if (game.gameDate < today) {
          acc.pastGames.push(game);
        } else {
          acc.futureGames.push(game);
        }
        return acc;
      },
      { pastGames: [] as Game[], futureGames: [] as Game[] },
    );
  }, [games, today]);

  const displayedGames = useMemo(() => {
    if (currentTab === "future") return futureGames;
    if (showAllPast) return pastGames;
    return pastGames.slice(0, 20);
  }, [currentTab, pastGames, futureGames, showAllPast]);

  return (
    <>
      <PageHeader
        title="Games"
        actions={
          <div className="flex-between gap-sm">
            {selectedGameIds.size > 0 && (
              <button
                className="btn btn-warning"
                onClick={() => {
                  const defaultFee = settings?.current_game_fee_cents || 1500;
                  setNewBatchFee(defaultFee.toString());
                  setShowBatchUpdateModal(true);
                }}
              >
                Update {selectedGameIds.size} Fee
              </button>
            )}
            <button
              className="btn btn-outline"
              onClick={() => setShowBatchModal(true)}
            >
              <Layers size={16} /> Batch Create
            </button>
            <button className="btn btn-primary" onClick={handleCreateGame}>
              <Plus size={16} /> Create Game
            </button>
          </div>
        }
      />

      {venueSummary && venueSummary.gameCount > 0 && (
        <div className="card mb-md">
          <div className="card-header">
            <h3 className="card-header__title">Venue Fees Overview</h3>
          </div>
          <div className="payment-summary-card">
            <div className="payment-summary-card__stats">
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">
                  Game Fees Owed
                </span>
                <CurrencyDisplay
                  cents={venueSummary.totalVenueFeeCents}
                  size="md"
                  colorCode={false}
                />
              </div>
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">
                  Game Fees Paid
                </span>
                <CurrencyDisplay
                  cents={venueSummary.totalVenuePaidCents}
                  size="md"
                  colorCode={false}
                />
              </div>
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">
                  Outstanding
                </span>
                <CurrencyDisplay
                  cents={venueSummary.outstandingCents}
                  size="md"
                />
              </div>
            </div>
            {venueSummary.totalVenueFeeCents > 0 && (
              <div className="payment-progress-bar">
                <div
                  className="payment-progress-bar__fill"
                  style={{
                    width: `${Math.min(100, Math.round((venueSummary.totalVenuePaidCents / venueSummary.totalVenueFeeCents) * 100))}%`,
                  }}
                />
              </div>
            )}
            <div
              className="text-muted text-sm"
              style={{ padding: "0 var(--spacing-md) var(--spacing-sm)" }}
            >
              {venueSummary.gameCount} games tracked &middot;{" "}
              {formatCurrency(
                Math.round(
                  venueSummary.totalVenueFeeCents / venueSummary.gameCount,
                ),
              )}{" "}
              avg per game
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <button
          className="btn btn-ghost"
          onClick={() => setCurrentTab("past")}
          style={{
            borderRadius: "0",
            borderBottom:
              currentTab === "past" ? "2px solid var(--primary)" : "none",
            padding: "0.75rem 0.5rem",
            marginBottom: "-1px",
            color:
              currentTab === "past"
                ? "var(--primary)"
                : "var(--text-secondary)",
            fontWeight: currentTab === "past" ? 600 : 500,
          }}
        >
          Past Games ({pastGames.length})
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setCurrentTab("future")}
          style={{
            borderRadius: "0",
            borderBottom:
              currentTab === "future" ? "2px solid var(--primary)" : "none",
            padding: "0.75rem 0.5rem",
            marginBottom: "-1px",
            color:
              currentTab === "future"
                ? "var(--primary)"
                : "var(--text-secondary)",
            fontWeight: currentTab === "future" ? 600 : 500,
          }}
        >
          Future Games ({futureGames.length})
        </button>
      </div>

      <DataTable<Game>
        columns={columns}
        data={displayedGames}
        isLoading={isLoading}
        getRowId={(game) => game.id}
        onRowClick={(game) => navigate(`/games/${game.id}`)}
        selectable={true}
        selectedIds={selectedGameIds}
        onSelectionChange={setSelectedGameIds}
        mobileLayout="cards"
        emptyIcon={<CalendarIcon size={48} />}
        emptyTitle={currentTab === "past" ? "No past games" : "No future games"}
        emptyDescription={
          currentTab === "past"
            ? "Completed games will appear here."
            : "Scheduled games will appear here."
        }
      />

      {currentTab === "past" && pastGames.length > 20 && !showAllPast && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "2rem",
          }}
        >
          <button
            className="btn btn-outline"
            onClick={() => setShowAllPast(true)}
            style={{ padding: "0.75rem 2rem" }}
          >
            Show All Games ({pastGames.length - 20} more)
          </button>
        </div>
      )}

      {/* Single Game Create Modal */}
      <Modal
        isOpen={showGameModal}
        title="Create New Game"
        onClose={() => setShowGameModal(false)}
        size="sm"
        footer={
          <>
            <button
              className="btn btn-outline"
              onClick={() => setShowGameModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={
                !newGameDate.trim() ||
                newGameFee === "" ||
                isNaN(Number(newGameFee)) ||
                createGameMutation.isPending
              }
              onClick={() => {
                submitGame();
                setShowGameModal(false);
              }}
            >
              Create Game
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Game Date</label>
          <input
            type="date"
            className="input-field"
            value={newGameDate}
            onChange={(e) => setNewGameDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Fee (in cents)</label>
          <div className="input-group">
            <span className="input-group__prefix">$</span>
            <input
              type="number"
              className="input-field"
              value={newGameFee}
              onChange={(e) => setNewGameFee(e.target.value)}
              placeholder="e.g. 1000"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  newGameDate.trim() &&
                  newGameFee !== "" &&
                  !isNaN(Number(newGameFee)) &&
                  !createGameMutation.isPending
                ) {
                  submitGame();
                  setShowGameModal(false);
                }
              }}
            />
          </div>
          <span className="form-hint">
            Amount in cents (e.g. 1000 = $10.00)
          </span>
        </div>
      </Modal>

      {/* Batch Create Modal */}
      <Modal
        isOpen={showBatchModal}
        title="Batch Create Games"
        onClose={() => setShowBatchModal(false)}
        size="lg"
        footer={
          <>
            <button
              className="btn btn-outline"
              onClick={() => setShowBatchModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!allUrlsValid || batchCreateMutation.isPending}
              onClick={handleBatchSubmit}
            >
              {batchCreateMutation.isPending
                ? "Creating..."
                : `Create ${batchPreview.length} Game${batchPreview.length !== 1 ? "s" : ""}`}
            </button>
          </>
        }
      >
        <div className="grid-2 gap-md">
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="input-field"
              value={batchStartDate}
              onChange={(e) => setBatchStartDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Frequency</label>
            <select
              className="input-field"
              value={batchFrequency}
              onChange={(e) =>
                setBatchFrequency(e.target.value as BatchFrequency)
              }
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Facebook Event URLs</label>
          <textarea
            className="input-field"
            rows={6}
            value={batchUrls}
            onChange={(e) => setBatchUrls(e.target.value)}
            placeholder={
              "https://facebook.com/events/123456789\nhttps://facebook.com/events/234567890\nhttps://facebook.com/events/345678901"
            }
          />
          <span className="form-hint">
            One URL per line. Each URL will be assigned a game date starting
            from the start date, incrementing by the selected frequency.
          </span>
        </div>

        {batchPreview.length > 0 && (
          <div className="card" style={{ marginTop: "var(--spacing-md)" }}>
            <div className="card-header">
              <h4 className="card-header__title">
                Preview ({batchPreview.length} game
                {batchPreview.length !== 1 ? "s" : ""})
              </h4>
            </div>
            <table className="batch-preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Facebook Event URL</th>
                </tr>
              </thead>
              <tbody>
                {batchPreview.map((item, i) => (
                  <tr key={i}>
                    <td className="text-muted">{i + 1}</td>
                    <td>{formatDate(item.date)}</td>
                    <td>
                      <StatusBadge variant={getStatusVariant(item.status)} dot>
                        {item.status}
                      </StatusBadge>
                    </td>
                    <td className={item.valid ? "" : "text-danger"}>
                      <span className="batch-preview-url" title={item.url}>
                        {item.valid ? item.url : `Invalid URL: ${item.url}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="text-secondary"
              style={{
                padding: "var(--spacing-sm) var(--spacing-md)",
                fontSize: "var(--font-size-sm)",
              }}
            >
              {scheduledCount} scheduled, {pendingCount} pending
            </div>
          </div>
        )}
      </Modal>

      {/* Batch Update Fee Modal */}
      <Modal
        isOpen={showBatchUpdateModal}
        title="Update Game Fees"
        onClose={() => setShowBatchUpdateModal(false)}
        size="sm"
        footer={
          <>
            <button
              className="btn btn-outline"
              onClick={() => setShowBatchUpdateModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={
                newBatchFee === "" ||
                isNaN(Number(newBatchFee)) ||
                batchUpdateMutation.isPending
              }
              onClick={() => batchUpdateMutation.mutate()}
            >
              {batchUpdateMutation.isPending
                ? "Updating..."
                : `Update ${selectedGameIds.size} Game${selectedGameIds.size !== 1 ? "s" : ""}`}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">New Fee (in cents)</label>
          <div className="input-group">
            <span className="input-group__prefix">$</span>
            <input
              type="number"
              className="input-field"
              value={newBatchFee}
              onChange={(e) => setNewBatchFee(e.target.value)}
              placeholder="e.g. 1500"
            />
          </div>
          <span className="form-hint">
            Only games without charges or that are not synced will be updated.
            Other games will be skipped.
          </span>
        </div>
      </Modal>
    </>
  );
};
