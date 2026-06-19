import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Upload,
  Edit2,
  Lock,
  Save,
  ExternalLink,
  XCircle,
  UserPlus,
  X,
  DollarSign,
  Copy,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { DataTable, type Column } from "../components/DataTable";
import { useToast } from "../contexts/ToastContext";
import { formatDate, formatCurrency } from "../utils/format";
import {
  GAME_SYNC_WEBHOOK_URL,
  type GameSyncResult,
  canSyncGame,
  buildGameSyncBody,
} from "../utils/gameSync";

type AttendanceRecord = {
  id: string;
  playerId: string;
  displayName: string;
  sourceStatus: string;
  chargeable: boolean;
};

type GameDetails = {
  id: string;
  gameDate: string;
  status: string;
  source: string;
  feeCents: number;
  venueFeeCents: number | null;
  facebookEventUrl?: string | null;
  attendance: AttendanceRecord[];
};

type Player = {
  id: string;
  displayName: string;
};

type PlayerPaymentStatus = {
  playerId: string;
  displayName: string;
  chargeCents: number;
  paidCents: number;
  status: "paid" | "partial" | "unpaid";
};

type PaymentStatusResponse = {
  gameId: string;
  feeCents: number;
  playerStatuses: PlayerPaymentStatus[];
  summary: {
    totalExpectedCents: number;
    totalPaidCents: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
  };
};

const statusVariant = (status: string) => {
  switch (status) {
    case "synced":
      return "success" as const;
    case "scheduled":
      return "info" as const;
    case "pending":
      return "warning" as const;
    case "cancelled":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
};

const sourceVariant = (source: string) => {
  switch (source) {
    case "facebook":
      return "info" as const;
    case "manual":
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
};

export const GameDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [isEditingFee, setIsEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [isEditingVenueFee, setIsEditingVenueFee] = useState(false);
  const [venueFeeInput, setVenueFeeInput] = useState("");
  const [importText, setImportText] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<GameSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addPlayerId, setAddPlayerId] = useState("");
  const [addChargeable, setAddChargeable] = useState(true);
  const [confirmPaymentData, setConfirmPaymentData] = useState<{
    playerId: string;
    amountCents: number;
    displayName: string;
  } | null>(null);

  const { data: game, isLoading } = useQuery({
    queryKey: ["games", id],
    queryFn: async () => {
      const { data } = await api.get<{ game: GameDetails }>(`/games/${id}`);
      return data.game;
    },
  });

  const { data: paymentStatus } = useQuery({
    queryKey: ["games", id, "payment-status"],
    queryFn: async () => {
      const { data } = await api.get<PaymentStatusResponse>(
        `/games/${id}/payment-status`,
      );
      return data;
    },
    enabled: !!game,
  });

  const { data: players } = useQuery({
    queryKey: ["players", "all-for-game"],
    queryFn: async () => {
      const { data } = await api.get(`/players?limit=1000`);
      return data.data as Player[];
    },
  });

  const updateGameMutation = useMutation({
    mutationFn: async (updates: {
      feeCents?: number;
      venueFeeCents?: number;
      status?: string;
    }) => {
      await api.patch(`/games/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setIsEditingFee(false);
      setIsEditingVenueFee(false);
    },
  });

  const importAttendanceMutation = useMutation({
    mutationFn: async (text: string) => {
      await api.post(`/games/${id}/attendance/import`, { text });
    },
    onSuccess: () => {
      setImportText("");
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
      addToast(
        "success",
        "Attendance imported successfully. Check the Reconciliation Queue for any unmatched names.",
      );
    },
  });

  const addPlayerMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/games/${id}/attendance`, {
        playerId: addPlayerId,
        chargeable: addChargeable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAddPlayerId("");
      setAddChargeable(true);
      setShowAddPlayer(false);
      addToast("success", "Player added to game.");
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { message?: string } } };
      const msg =
        err instanceof Error
          ? err.message
          : error.response?.data?.message ?? "Failed to add player.";
      addToast("error", msg);
    },
  });

  const removePlayerMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      await api.delete(`/games/${id}/attendance/${attendanceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      addToast("success", "Player removed from game.");
    },
    onError: () => {
      addToast("error", "Failed to remove player.");
    },
  });

  const manualPaymentMutation = useMutation({
    mutationFn: async ({
      playerId,
      amountCents,
    }: {
      playerId: string;
      amountCents: number;
    }) => {
      await api.post(`/players/${playerId}/manual-payment`, {
        amountCents,
        gameId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["games", id, "payment-status"],
      });
      queryClient.invalidateQueries({ queryKey: ["payment-matrix"] });
      addToast("success", "Payment recorded successfully");
    },
  });

  const handleSaveFee = () => {
    const newFee = Number(feeInput);
    if (!isNaN(newFee)) {
      updateGameMutation.mutate({ feeCents: newFee });
    }
  };

  const handleSaveVenueFee = () => {
    const newFee = Number(venueFeeInput);
    if (!isNaN(newFee) && newFee > 0) {
      updateGameMutation.mutate({ venueFeeCents: newFee });
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (importText.trim()) {
      importAttendanceMutation.mutate(importText);
    }
  };

  // Trigger the n8n workflow to scrape this game's Facebook event and import
  // attendance. The browser calls n8n directly (same pattern as bank sync);
  // n8n POSTs the roster to /api/webhooks/facebook-attendance and returns its
  // result here. Progress + the result report are shown in a modal.
  const handleSyncFromFacebook = async () => {
    if (!game || !canSyncGame(game) || !game.facebookEventUrl) return;
    setIsSyncModalOpen(true);
    setIsSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch(GAME_SYNC_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(buildGameSyncBody(game.id, game.facebookEventUrl)),
      });
      if (!res.ok) throw new Error(`Sync failed with status ${res.status}`);
      const raw = (await res.json().catch(() => null)) as
        | GameSyncResult
        | GameSyncResult[]
        | null;
      // n8n "lastNode" responses can be a single object or a 1-element array.
      setSyncResult(Array.isArray(raw) ? raw[0] ?? null : raw);

      // Refresh everything a sync can affect.
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      queryClient.invalidateQueries({
        queryKey: ["games", id, "payment-status"],
      });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Body of the sync modal: spinner while loading, then a result report.
  const renderSyncModalBody = () => {
    if (isSyncing) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
            padding: "1.5rem 0",
          }}
        >
          <RefreshCw size={32} className="spin" style={{ color: "var(--primary)" }} />
          <p className="text-secondary">
            Fetching the attendee list from Facebook…
          </p>
        </div>
      );
    }

    if (syncError) {
      return (
        <div style={{ padding: "0.5rem 0" }}>
          <p className="text-danger">
            <strong>Sync failed.</strong> {syncError}
          </p>
          <p className="text-muted text-sm" style={{ marginTop: "0.5rem" }}>
            The attendees may still have imported — close this and check the list
            below, or try again.
          </p>
        </div>
      );
    }

    if (!syncResult) return null;

    const imported = syncResult.imported ?? 0;
    const charged = syncResult.charged ?? 0;
    const queued = syncResult.queued ?? 0;
    const players = syncResult.players ?? [];
    const unmatched = syncResult.unmatched ?? [];

    return (
      <div>
        <div style={{ display: "flex", gap: "2rem", marginBottom: "1rem" }}>
          {[
            { label: "Imported", value: imported },
            { label: "Charged", value: charged },
            ...(queued > 0 ? [{ label: "Unmatched", value: queued }] : []),
          ].map((s) => (
            <div key={s.label}>
              <div
                style={{ fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.1 }}
              >
                {s.value}
              </div>
              <div className="text-muted text-sm">{s.label}</div>
            </div>
          ))}
        </div>

        {syncResult.warning && (
          <p style={{ color: "var(--warning)", marginBottom: "0.75rem" }}>
            {syncResult.warning}
          </p>
        )}

        {imported === 0 && !syncResult.warning && (
          <p className="text-secondary" style={{ marginBottom: "0.75rem" }}>
            No new players were imported — they may already be in this game, or
            none were marked “going”.
          </p>
        )}

        {unmatched.length > 0 ? (
          <p
            className="text-secondary text-sm"
            style={{ marginBottom: "0.75rem" }}
          >
            Didn’t match a player (now in the Reconciliation Queue):{" "}
            <span style={{ color: "var(--warning)" }}>
              {unmatched.join(", ")}
            </span>
          </p>
        ) : (
          queued > 0 && (
            <p
              className="text-secondary text-sm"
              style={{ marginBottom: "0.75rem" }}
            >
              {queued} name{queued === 1 ? "" : "s"} didn’t match a player and{" "}
              {queued === 1 ? "is" : "are"} waiting in the Reconciliation Queue.
            </p>
          )
        )}

        {players.length > 0 ? (
          <div>
            <h4 className="card-header__title" style={{ marginBottom: "0.5rem" }}>
              Players synced ({players.length})
            </h4>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.4rem",
                maxHeight: "220px",
                overflowY: "auto",
              }}
            >
              {players.map((p) => (
                <span key={p} className="badge badge-neutral">
                  {p}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted text-sm">
            Updated attendees are listed in the table below.
          </p>
        )}
      </div>
    );
  };

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addPlayerId) return;
    addPlayerMutation.mutate();
  };

  const handleTextExport = () => {
    if (!game?.attendance || !paymentStatus?.playerStatuses) return;

    const formattedDate = formatDate(game.gameDate);
    const lines = [`Outstanding payments from ${formattedDate}`, ""];

    game.attendance
      .filter((att) => att.chargeable)
      .filter((att) => {
        const ps = paymentStatus.playerStatuses.find(
          (p) => p.playerId === att.playerId,
        );
        return ps && ps.status !== "paid";
      })
      .forEach((att) => {
        const ps = paymentStatus.playerStatuses.find(
          (p) => p.playerId === att.playerId,
        );
        let emoji = "⏳"; // Default unpaid
        let prefix = "@";
        if (ps) {
          if (ps.status === "paid") {
            emoji = "✅";
            prefix = "";
          } else if (ps.status === "partial") {
            emoji = "⏳";
            prefix = "@";
          }
        }
        lines.push(`${emoji} ${prefix}${att.displayName}`);
      });

    const text = lines.join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        addToast("success", "Attendees list copied to clipboard");
      })
      .catch(() => {
        addToast("error", "Failed to copy to clipboard");
      });
  };

  // Players not already in the game
  const availablePlayers = useMemo(() => {
    const attendingIds = new Set(
      game?.attendance?.map((a) => a.playerId) ?? [],
    );
    return (players ?? []).filter((p) => !attendingIds.has(p.id));
  }, [players, game?.attendance]);

  const attendanceColumns: Column<AttendanceRecord>[] = useMemo(
    () => [
      {
        key: "player",
        header: "Player",
        sortable: true,
        sortValue: (att) => att.displayName,
        render: (att) => (
          <Link to={`/players/${att.playerId}`} className="text-link">
            {att.displayName}
          </Link>
        ),
      },
      {
        key: "response",
        header: "Response",
        sortable: true,
        sortValue: (att) => att.sourceStatus,
        render: (att) => (
          <span className="text-capitalize">{att.sourceStatus}</span>
        ),
      },
      {
        key: "chargeable",
        header: "Chargeable",
        align: "center",
        render: (att) => (
          <StatusBadge variant={att.chargeable ? "warning" : "neutral"} dot>
            {att.chargeable ? "Yes" : "No"}
          </StatusBadge>
        ),
      },
      {
        key: "paymentStatus",
        header: "Payment",
        align: "center",
        render: (att) => {
          if (!att.chargeable) return <span className="text-muted">—</span>;
          const ps = paymentStatus?.playerStatuses?.find(
            (p) => p.playerId === att.playerId,
          );
          if (!ps) return <span className="text-muted">…</span>;
          const variant =
            ps.status === "paid"
              ? "success"
              : ps.status === "partial"
                ? "warning"
                : "danger";
          const label =
            ps.status === "partial"
              ? `${formatCurrency(ps.paidCents)}/${formatCurrency(ps.chargeCents)}`
              : ps.status === "paid"
                ? "Paid"
                : "Unpaid";
          return (
            <StatusBadge
              variant={variant as "success" | "warning" | "danger"}
              dot
            >
              {label}
            </StatusBadge>
          );
        },
      },
      {
        key: "actions",
        header: "",
        align: "right",
        render: (att) => {
          const ps = paymentStatus?.playerStatuses?.find(
            (p) => p.playerId === att.playerId,
          );
          const outstandingCents = ps ? ps.chargeCents - ps.paidCents : 0;
          const showPayButton =
            att.chargeable &&
            ps &&
            (ps.status === "unpaid" || ps.status === "partial");

          return (
            <div
              className="flex-align justify-end gap-sm"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--spacing-sm)",
              }}
            >
              {showPayButton && (
                <button
                  className="btn btn-sm btn-outline text-success"
                  style={{ padding: "0.25rem 0.5rem", height: "auto" }}
                  title="Mark this game as paid with cash"
                  disabled={manualPaymentMutation.isPending}
                  onClick={() => {
                    setConfirmPaymentData({
                      playerId: att.playerId,
                      amountCents: outstandingCents,
                      displayName: att.displayName,
                    });
                  }}
                >
                  <DollarSign size={14} style={{ marginRight: "0.25rem" }} />{" "}
                  Cash Paid
                </button>
              )}
              <button
                className="btn btn-ghost btn-icon btn-danger"
                title="Remove player from game"
                onClick={() => removePlayerMutation.mutate(att.id)}
                disabled={removePlayerMutation.isPending}
              >
                <X size={14} />
              </button>
            </div>
          );
        },
      },
    ],
    [removePlayerMutation, paymentStatus, manualPaymentMutation],
  );

  if (isLoading)
    return (
      <div className="page-header">
        <h1 className="page-title">Loading...</h1>
      </div>
    );
  if (!game)
    return (
      <div className="page-header">
        <h1 className="page-title">Game Not Found</h1>
      </div>
    );

  const formattedDate = formatDate(game.gameDate);
  const isFeeLocked = game.status === "synced" || game.status === "cancelled";
  const canCancel = game.status !== "cancelled" && game.status !== "synced";

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Games", to: "/games" },
          { label: formattedDate },
        ]}
        title={`Game on ${formattedDate}`}
        actions={
          <div className="flex-between gap-sm">
            <StatusBadge variant={statusVariant(game.status)} dot>
              {game.status}
            </StatusBadge>
            <StatusBadge variant={sourceVariant(game.source)}>
              {game.source}
            </StatusBadge>
          </div>
        }
      />

      {game.facebookEventUrl && (
        <div className="mt-sm mb-md">
          <a
            href={game.facebookEventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              fontSize: "var(--font-sm)",
            }}
          >
            <ExternalLink size={14} />
            Facebook Event
          </a>
        </div>
      )}

      <div className="grid-2 mt-md">
        {/* Match Fee Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">Match Fee</h3>
          </div>

          {isEditingFee ? (
            <div className="flex-between gap-sm">
              <div className="input-group">
                <span className="input-group__prefix">$</span>
                <input
                  type="number"
                  className="input-field"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveFee}
              >
                <Save size={16} /> Save
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setIsEditingFee(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex-between">
              <CurrencyDisplay
                cents={game.feeCents}
                size="lg"
                colorCode={false}
              />
              {isFeeLocked ? (
                <span className="text-muted" title="Fee locked after sync">
                  <Lock size={16} />
                </span>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setFeeInput(game.feeCents.toString());
                    setIsEditingFee(true);
                  }}
                >
                  <Edit2 size={14} />
                </button>
              )}
            </div>
          )}

          {canCancel && (
            <button
              className="btn btn-danger mt-md"
              onClick={() => updateGameMutation.mutate({ status: "cancelled" })}
              disabled={updateGameMutation.isPending}
            >
              <XCircle size={16} /> Cancel Game
            </button>
          )}

          {/* Venue Fee */}
          <div
            style={{
              borderTop: "1px solid var(--border-color)",
              marginTop: "var(--spacing-md)",
              paddingTop: "var(--spacing-md)",
            }}
          >
            <span className="text-muted text-sm">Venue Fee</span>
            {isEditingVenueFee ? (
              <div className="flex-between gap-sm mt-xs">
                <div className="input-group">
                  <span className="input-group__prefix">$</span>
                  <input
                    type="number"
                    className="input-field"
                    value={venueFeeInput}
                    onChange={(e) => setVenueFeeInput(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveVenueFee}
                >
                  <Save size={16} /> Save
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setIsEditingVenueFee(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex-between mt-xs">
                {game.venueFeeCents != null ? (
                  <CurrencyDisplay
                    cents={game.venueFeeCents}
                    size="md"
                    colorCode={false}
                  />
                ) : (
                  <span className="text-muted">N/A</span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setVenueFeeInput((game.venueFeeCents ?? 0).toString());
                    setIsEditingVenueFee(true);
                  }}
                >
                  <Edit2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Import Facebook Poll Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">
              <Upload size={20} /> Import Facebook Poll
            </h3>
            {game.status !== "cancelled" && (
              <button
                className="btn btn-outline btn-sm"
                onClick={handleSyncFromFacebook}
                disabled={isSyncing || !canSyncGame(game)}
                title={
                  canSyncGame(game)
                    ? "Fetch the attendee list automatically from Facebook"
                    : "No Facebook event linked to this game"
                }
              >
                <RefreshCw size={16} className={isSyncing ? "spin" : ""} />
                {isSyncing ? "Syncing…" : "Sync from Facebook"}
              </button>
            )}
          </div>
          <p className="text-secondary mb-md">
            Pull the attendee list automatically with <strong>Sync from
            Facebook</strong>, or copy and paste it from the event poll below.
            Our engine maps names automatically.
          </p>
          <form onSubmit={handleImportSubmit}>
            <div className="form-group">
              <textarea
                className="input-field"
                rows={8}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`e.g. 5 Going: John Doe, Jane Smith\n3 Defaulted: Bobby Tables\n2 Can't go: Foo Bar`}
                required
              />
              <span className="form-hint">
                Supports Going, Defaulted, and Can't go sections
              </span>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={importAttendanceMutation.isPending}
            >
              {importAttendanceMutation.isPending
                ? "Importing..."
                : "Process Import"}
            </button>
          </form>
        </div>
      </div>

      {/* Payment Summary Card */}
      {paymentStatus && paymentStatus.summary.totalExpectedCents > 0 && (
        <div className="card mt-md">
          <div className="card-header">
            <h3 className="card-header__title">
              <DollarSign size={20} /> Payment Summary
            </h3>
          </div>
          <div className="payment-summary-card">
            <div className="payment-summary-card__stats">
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">
                  Expected
                </span>
                <CurrencyDisplay
                  cents={paymentStatus.summary.totalExpectedCents}
                  size="md"
                  colorCode={false}
                />
              </div>
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">
                  Received
                </span>
                <CurrencyDisplay
                  cents={-paymentStatus.summary.totalPaidCents}
                  size="md"
                />
              </div>
              <div className="payment-summary-card__stat">
                <span className="payment-summary-card__stat-label">
                  Outstanding
                </span>
                <CurrencyDisplay
                  cents={
                    paymentStatus.summary.totalExpectedCents -
                    paymentStatus.summary.totalPaidCents
                  }
                  size="md"
                />
              </div>
            </div>
            <div className="payment-progress-bar">
              <div
                className="payment-progress-bar__fill"
                style={{
                  width: `${Math.min(100, Math.round((paymentStatus.summary.totalPaidCents / paymentStatus.summary.totalExpectedCents) * 100))}%`,
                }}
              />
            </div>
            <div className="payment-summary-card__counts">
              <span className="payment-summary-card__count payment-summary-card__count--paid">
                {paymentStatus.summary.paidCount} paid
              </span>
              {paymentStatus.summary.partialCount > 0 && (
                <span className="payment-summary-card__count payment-summary-card__count--partial">
                  {paymentStatus.summary.partialCount} partial
                </span>
              )}
              <span className="payment-summary-card__count payment-summary-card__count--unpaid">
                {paymentStatus.summary.unpaidCount} unpaid
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Table */}
      <div className="card mt-md">
        <div className="card-header">
          <h3 className="card-header__title">
            Attendees (
            {game.attendance?.filter((a) => a.chargeable).length || 0})
          </h3>
          <div className="flex gap-sm">
            <button
              className="btn btn-outline btn-sm"
              onClick={handleTextExport}
              title="Copy attendance list with payment status emojis"
            >
              <Copy size={16} />
              Text Export
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setShowAddPlayer((v) => !v);
                setAddPlayerId("");
                setAddChargeable(true);
              }}
            >
              <UserPlus size={16} />
              {showAddPlayer ? "Cancel" : "Add Player"}
            </button>
          </div>
        </div>

        {showAddPlayer && (
          <form onSubmit={handleAddPlayer} className="attendance-add-form">
            <select
              className="input-field"
              value={addPlayerId}
              onChange={(e) => setAddPlayerId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select player…
              </option>
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>

            <label className="attendance-add-form__charge-toggle">
              <input
                type="checkbox"
                checked={addChargeable}
                onChange={(e) => setAddChargeable(e.target.checked)}
              />
              <span>Charge game fee</span>
            </label>

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!addPlayerId || addPlayerMutation.isPending}
            >
              {addPlayerMutation.isPending ? "Adding…" : "Add"}
            </button>
          </form>
        )}

        <DataTable<AttendanceRecord>
          columns={attendanceColumns}
          data={game.attendance?.filter((a) => a.chargeable) ?? []}
          getRowId={(att) => att.id}
          emptyTitle="No 'yes' attendees"
          emptyDescription="Import a Facebook poll or add attendance manually."
        />
      </div>

      <Modal
        isOpen={isSyncModalOpen}
        onClose={() => {
          if (!isSyncing) setIsSyncModalOpen(false);
        }}
        title="Sync from Facebook"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => setIsSyncModalOpen(false)}
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing…" : "Done"}
          </button>
        }
      >
        {renderSyncModalBody()}
      </Modal>

      <Modal
        isOpen={!!confirmPaymentData}
        onClose={() => setConfirmPaymentData(null)}
        title="Confirm Custom Payment"
        footer={
          <div className="flex gap-sm">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmPaymentData(null)}
              disabled={manualPaymentMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (confirmPaymentData) {
                  manualPaymentMutation.mutate(
                    {
                      playerId: confirmPaymentData.playerId,
                      amountCents: confirmPaymentData.amountCents,
                    },
                    {
                      onSuccess: () => setConfirmPaymentData(null),
                    },
                  );
                }
              }}
              disabled={manualPaymentMutation.isPending}
            >
              Record Payment
            </button>
          </div>
        }
      >
        <p className="text-secondary">
          Are you sure you want to record a cash payment of{" "}
          <strong>
            {confirmPaymentData
              ? `$${(confirmPaymentData.amountCents / 100).toFixed(2)}`
              : ""}
          </strong>{" "}
          for {confirmPaymentData?.displayName}?
        </p>
      </Modal>
    </>
  );
};
