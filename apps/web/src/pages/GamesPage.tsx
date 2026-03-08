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
  status: string;
  feeCents: number;
  attendanceCount?: number;
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
    header: "Date",
    sortable: true,
    sortValue: (game) => game.gameDate,
    render: (game) => (
      <span className="data-table__date-cell">
        <CalendarIcon size={20} className="text-primary" />
        {formatDate(game.gameDate)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (game) => (
      <StatusBadge variant={getStatusVariant(game.status)} dot>
        {game.status}
      </StatusBadge>
    ),
  },
  {
    key: "feeCents",
    header: "Fee",
    render: (game) => (
      <CurrencyDisplay cents={game.feeCents} size="sm" colorCode={false} />
    ),
  },
  {
    key: "attendanceCount",
    header: "Attendees",
    render: (game) => game.attendanceCount || 0,
  },
  {
    key: "expected",
    header: "Expected",
    render: (game) => (
      <CurrencyDisplay
        cents={(game.attendanceCount || 0) * game.feeCents}
        size="sm"
        colorCode={false}
      />
    ),
  },
  {
    key: "source",
    header: "Source",
    render: (game) => (
      <span className="text-muted text-capitalize">{game.source}</span>
    ),
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
      const successful = result.updated.filter((r: any) => r.success).length;
      const failed = result.updated.filter((r: any) => !r.success).length;
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
                <span className="payment-summary-card__stat-label">Game Fees Owed</span>
                <CurrencyDisplay cents={venueSummary.totalVenueFeeCents} size="md" colorCode={false} />
              </div>
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">Game Fees Paid</span>
                <CurrencyDisplay cents={venueSummary.totalVenuePaidCents} size="md" colorCode={false} />
              </div>
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">Outstanding</span>
                <CurrencyDisplay cents={venueSummary.outstandingCents} size="md" />
              </div>
            </div>
            {venueSummary.totalVenueFeeCents > 0 && (
              <div className="payment-progress-bar">
                <div
                  className="payment-progress-bar__fill"
                  style={{ width: `${Math.min(100, Math.round((venueSummary.totalVenuePaidCents / venueSummary.totalVenueFeeCents) * 100))}%` }}
                />
              </div>
            )}
            <div className="text-muted text-sm" style={{ padding: "0 var(--spacing-md) var(--spacing-sm)" }}>
              {venueSummary.gameCount} games tracked &middot; {formatCurrency(Math.round(venueSummary.totalVenueFeeCents / venueSummary.gameCount))} avg per game
            </div>
          </div>
        </div>
      )}

      <DataTable<Game>
        columns={columns}
        data={games}
        isLoading={isLoading}
        getRowId={(game) => game.id}
        onRowClick={(game) => navigate(`/games/${game.id}`)}
        selectable={true}
        selectedIds={selectedGameIds}
        onSelectionChange={setSelectedGameIds}
        emptyIcon={<CalendarIcon size={48} />}
        emptyTitle="No games yet"
        emptyDescription="Create your first game to start tracking attendance and fees."
      />

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
