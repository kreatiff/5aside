import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Upload, Edit2, Lock, Save, ExternalLink, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { DataTable, type Column } from "../components/DataTable";
import { useToast } from "../contexts/ToastContext";
import { formatDate } from "../utils/format";

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
  facebookEventUrl?: string | null;
  attendance: AttendanceRecord[];
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

const attendanceColumns: Column<AttendanceRecord>[] = [
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
];

export const GameDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [isEditingFee, setIsEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [importText, setImportText] = useState("");

  const { data: game, isLoading } = useQuery({
    queryKey: ["games", id],
    queryFn: async () => {
      const { data } = await api.get<{ game: GameDetails }>(`/games/${id}`);
      return data.game;
    },
  });

  const updateGameMutation = useMutation({
    mutationFn: async (updates: { feeCents?: number; status?: string }) => {
      await api.patch(`/games/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setIsEditingFee(false);
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
        "Attendance imported successfully. Check the Reconciliation Queue for any unmatched names."
      );
    },
  });

  const handleSaveFee = () => {
    const newFee = Number(feeInput);
    if (!isNaN(newFee)) {
      updateGameMutation.mutate({ feeCents: newFee });
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (importText.trim()) {
      importAttendanceMutation.mutate(importText);
    }
  };

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
            style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "var(--font-sm)" }}
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
              <button className="btn btn-primary btn-sm" onClick={handleSaveFee}>
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
              <CurrencyDisplay cents={game.feeCents} size="lg" colorCode={false} />
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
        </div>

        {/* Import Facebook Poll Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">
              <Upload size={20} /> Import Facebook Poll
            </h3>
          </div>
          <p className="text-secondary mb-md">
            Copy and paste the attendee list from the Facebook event poll. Our
            engine will map names automatically.
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

      {/* Attendance Table */}
      <div className="card mt-md">
        <div className="card-header">
          <h3 className="card-header__title">
            Attendance List ({game.attendance?.length || 0})
          </h3>
        </div>
        <DataTable<AttendanceRecord>
          columns={attendanceColumns}
          data={game.attendance ?? []}
          getRowId={(att) => att.id}
          emptyTitle="No attendance records"
          emptyDescription="Import a Facebook poll or add attendance manually."
        />
      </div>
    </>
  );
};
