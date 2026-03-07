import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Plus,
  Receipt,
  UserX,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { DataTable, type Column } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import {
  formatDate,
  formatDateTime,
  parseDateToTimestamp,
  getInitials,
  getAvatarColor,
} from "../utils/format";

type PlayerDetails = {
  id: string;
  displayName: string;
  createdAt: string;
  currentBalanceCents: number;
  active: boolean;
};

type Alias = {
  id: string;
  aliasRaw: string;
  sourceType: string;
};

type LedgerEntry = {
  id: string;
  created_at: string;
  type: string;
  amount_cents: number;
  adjustment_reason?: string;
  game_date?: string | null;
  bank_posted_at?: string | null;
};

function ledgerTypeBadgeVariant(
  type: string,
): "danger" | "success" | "neutral" {
  if (type === "charge") return "danger";
  if (type === "payment") return "success";
  return "neutral";
}

function ledgerDetails(entry: LedgerEntry): string {
  if (entry.type === "charge") return "Game fee";
  if (entry.type === "adjustment") return entry.adjustment_reason ?? "";
  return "Bank deposit";
}

export const PlayerDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [showConfirmMerge, setShowConfirmMerge] = useState(false);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [showAliasesPanel, setShowAliasesPanel] = useState(false);
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [ledgerFilter, setLedgerFilter] = useState<
    "all" | "charge" | "payment"
  >("all");

  const { data: allPlayers } = useQuery({
    queryKey: ["players-all"],
    queryFn: async () => {
      const { data } = await api.get<{ data: PlayerDetails[] }>(
        `/players?limit=1000`,
      );
      return data.data;
    },
  });

  const { data: player, isLoading } = useQuery({
    queryKey: ["players", id],
    queryFn: async () => {
      const { data } = await api.get<{ player: PlayerDetails }>(
        `/players/${id}`,
      );
      return data.player;
    },
  });

  const { data: aliases, isLoading: loadingAliases } = useQuery({
    queryKey: ["players", id, "aliases"],
    queryFn: async () => {
      const { data } = await api.get<{ aliases: Alias[] }>(
        `/players/${id}/aliases`,
      );
      return data.aliases;
    },
  });

  const { data: ledger, isLoading: loadingLedger } = useQuery({
    queryKey: ["players", id, "ledger"],
    queryFn: async () => {
      const { data } = await api.get(`/players/${id}/ledger?limit=10000`);
      return data;
    },
  });

  const addAliasMutation = useMutation({
    mutationFn: async ({
      source,
      aliasRaw,
    }: {
      source: string;
      aliasRaw: string;
    }) => {
      await api.post(`/players/${id}/aliases`, { source, aliasRaw });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players", id, "aliases"] });
      addToast("success", "Alias added successfully");
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: async (aliasId: string) => {
      await api.delete(`/players/${id}/aliases/${aliasId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players", id, "aliases"] });
      addToast("success", "Alias removed.");
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async (updates: Partial<PlayerDetails>) => {
      await api.patch(`/players/${id}`, updates);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["players", id] });
      const newStatus = variables.active ? "active" : "inactive";
      addToast("success", `Player marked as ${newStatus}`);
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({
      sourcePlayerIds,
      targetPlayerId,
    }: {
      sourcePlayerIds: string[];
      targetPlayerId: string;
    }) => {
      await api.post(`/players/merge`, { sourcePlayerIds, targetPlayerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      setMergeSelection([]);
      setShowConfirmMerge(false);
      addToast("success", "Profiles merged successfully");
    },
  });

  const submitAlias = () => {
    if (aliasInput.trim()) {
      addAliasMutation.mutate({
        source: "facebook",
        aliasRaw: aliasInput.trim(),
      });
    }
  };

  const ledgerColumns: Column<LedgerEntry>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date",
        sortable: true,
        sortValue: (e) => {
          const dateStr =
            e.type === "charge" && e.game_date
              ? e.game_date
              : e.type === "payment" && e.bank_posted_at
                ? e.bank_posted_at
                : e.created_at;
          return parseDateToTimestamp(dateStr);
        },
        render: (entry) => {
          if (entry.type === "charge" && entry.game_date) {
            return <span>{formatDate(entry.game_date)}</span>;
          }
          if (entry.type === "payment" && entry.bank_posted_at) {
            return <span>{formatDate(entry.bank_posted_at)}</span>;
          }
          return <span>{formatDateTime(entry.created_at)}</span>;
        },
      },
      {
        key: "type",
        header: "Type",
        render: (entry) => (
          <StatusBadge variant={ledgerTypeBadgeVariant(entry.type)}>
            {entry.type}
          </StatusBadge>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        sortable: true,
        sortValue: (e) => e.amount_cents,
        render: (entry) => (
          <CurrencyDisplay cents={entry.amount_cents} size="sm" />
        ),
      },
      {
        key: "details",
        header: "Details",
        render: (entry) => (
          <span className="text-muted">{ledgerDetails(entry)}</span>
        ),
      },
    ],
    [],
  );

  const ledgerData: LedgerEntry[] = (ledger?.data ?? []).filter(
    (e: LedgerEntry) => ledgerFilter === "all" || e.type === ledgerFilter,
  );

  const mergeCandidates = allPlayers?.filter((p) => p.id !== id) ?? [];

  if (isLoading) {
    return <PageHeader title="Loading..." />;
  }

  if (!player) {
    return <PageHeader title="Player Not Found" />;
  }

  return (
    <>
      <PageHeader
        title={player.displayName}
        breadcrumbs={[
          { label: "Players", to: "/players" },
          { label: player.displayName },
        ]}
        description={`Added ${formatDateTime(player.createdAt)}`}
        actions={
          <div className="flex-between gap-md">
            <div
              className="player-avatar-lg"
              style={{ background: getAvatarColor(player.displayName) }}
            >
              {getInitials(player.displayName)}
            </div>
            <div>
              <StatusBadge
                variant={player.active ? "success" : "neutral"}
                dot
                pulse={player.active}
              >
                {player.active ? "Active" : "Inactive"}
              </StatusBadge>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  updatePlayerMutation.mutate({ active: !player.active })
                }
                disabled={updatePlayerMutation.isPending}
              >
                {player.active ? "Deactivate" : "Activate"}
              </button>
            </div>
            <div>
              <span className="text-muted">Current Balance</span>
              <CurrencyDisplay
                cents={player.currentBalanceCents}
                size="xl"
                colorCode
                animated
              />
            </div>
          </div>
        }
      />

      <div className="grid-2 gap-md mb-lg">
        {/* Merge Controls */}
        <div className="card">
          <div
            className="card-header cursor-pointer m-0"
            style={{
              cursor: "pointer",
              paddingBottom: showMergePanel ? "var(--spacing-md)" : "0",
              marginBottom: showMergePanel ? "var(--spacing-md)" : "0",
              borderBottom: showMergePanel
                ? "1px solid var(--border-subtle)"
                : "none",
            }}
            onClick={() => setShowMergePanel(!showMergePanel)}
          >
            <div
              className="flex-align gap-sm"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-sm)",
              }}
            >
              {showMergePanel ? (
                <ChevronDown size={20} className="text-muted" />
              ) : (
                <ChevronRight size={20} className="text-muted" />
              )}
              <h4
                className="card-header__title m-0"
                style={{ marginBottom: 0 }}
              >
                Merge Duplicate Profiles
              </h4>
            </div>
          </div>

          {showMergePanel && (
            <div className="fadeIn">
              <p className="text-muted mb-md">
                Select duplicates from the list below to merge into this
                profile. The selected profiles will be permanently deleted and
                all of their ledgers, aliases, and attendance records will be
                cleanly transferred here.
              </p>
              <div className="flex-between gap-md">
                <div className="merge-candidates-list">
                  {mergeCandidates.map((p) => (
                    <label key={p.id} className="merge-candidate-label">
                      <input
                        type="checkbox"
                        checked={mergeSelection.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMergeSelection([...mergeSelection, p.id]);
                          } else {
                            setMergeSelection(
                              mergeSelection.filter(
                                (selectedId) => selectedId !== p.id,
                              ),
                            );
                          }
                        }}
                        disabled={mergeMutation.isPending}
                      />
                      {p.displayName}
                    </label>
                  ))}
                </div>
                <div className="merge-actions">
                  {!showConfirmMerge ? (
                    <button
                      className="btn btn-primary"
                      disabled={mergeMutation.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        if (mergeSelection.length === 0) {
                          addToast(
                            "error",
                            "Please select at least one duplicate profile from the list to merge.",
                          );
                          return;
                        }
                        setShowConfirmMerge(true);
                      }}
                    >
                      Merge {mergeSelection.length} Profile
                      {mergeSelection.length !== 1 ? "s" : ""}
                    </button>
                  ) : (
                    <div className="gap-sm">
                      <p className="text-danger mb-md">
                        <strong>Are you absolutely sure?</strong>
                      </p>
                      <button
                        className="btn btn-danger"
                        disabled={mergeMutation.isPending}
                        onClick={(e) => {
                          e.preventDefault();
                          mergeMutation.mutate({
                            sourcePlayerIds: mergeSelection,
                            targetPlayerId: id!,
                          });
                        }}
                      >
                        Yes, Delete &amp; Merge
                      </button>
                      <button
                        className="btn btn-outline"
                        disabled={mergeMutation.isPending}
                        onClick={(e) => {
                          e.preventDefault();
                          setShowConfirmMerge(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {!showConfirmMerge && (
                    <button
                      className="btn btn-outline"
                      disabled={
                        mergeSelection.length === 0 || mergeMutation.isPending
                      }
                      onClick={() => setMergeSelection([])}
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Aliases Column */}
        <div className="card">
          <div
            className="card-header"
            style={{
              cursor: "pointer",
              paddingBottom: showAliasesPanel ? "var(--spacing-md)" : "0",
              marginBottom: showAliasesPanel ? "var(--spacing-md)" : "0",
              borderBottom: showAliasesPanel
                ? "1px solid var(--border-subtle)"
                : "none",
            }}
            onClick={() => setShowAliasesPanel(!showAliasesPanel)}
          >
            <div
              className="flex-align gap-sm"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-sm)",
              }}
            >
              {showAliasesPanel ? (
                <ChevronDown size={20} className="text-muted" />
              ) : (
                <ChevronRight size={20} className="text-muted" />
              )}
              <h3
                className="card-header__title m-0"
                style={{ marginBottom: 0 }}
              >
                Connected Aliases
              </h3>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowAliasModal(true);
              }}
            >
              <Plus size={16} />
            </button>
          </div>

          {showAliasesPanel && (
            <div className="fadeIn">
              {loadingAliases ? (
                <p className="text-muted">Loading...</p>
              ) : aliases?.length === 0 ? (
                <EmptyAliasState />
              ) : (
                <div className="gap-sm">
                  {aliases?.map((alias: Alias) => (
                    <span key={alias.id} className="alias-pill">
                      {alias.aliasRaw}
                      <button
                        className="alias-pill__delete"
                        onClick={() => deleteAliasMutation.mutate(alias.id)}
                        title="Remove alias"
                        disabled={deleteAliasMutation.isPending}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ledger Column */}
      <div className="card mb-lg">
        <div className="card-header">
          <h3 className="card-header__title">Recent Transactions</h3>
          <div className="gap-sm" style={{ display: "flex" }}>
            {(["all", "charge", "payment"] as const).map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${ledgerFilter === f ? "btn-primary" : "btn-outline"}`}
                onClick={() => setLedgerFilter(f)}
              >
                {f === "all" ? "All" : f === "charge" ? "Charges" : "Payments"}
              </button>
            ))}
          </div>
        </div>

        <DataTable<LedgerEntry>
          columns={ledgerColumns}
          data={ledgerData}
          isLoading={loadingLedger}
          getRowId={(entry) => entry.id}
          emptyIcon={<Receipt size={32} />}
          emptyTitle="No transactions yet"
          emptyDescription="Charges and payments will appear here once games are recorded."
        />
      </div>

      <Modal
        isOpen={showAliasModal}
        title="Add New Alias"
        onClose={() => setShowAliasModal(false)}
        size="sm"
        footer={
          <>
            <button
              className="btn btn-outline"
              onClick={() => setShowAliasModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!aliasInput.trim() || addAliasMutation.isPending}
              onClick={() => {
                submitAlias();
                setShowAliasModal(false);
                setAliasInput("");
              }}
            >
              Add Alias
            </button>
          </>
        }
      >
        <div className="form-group">
          <p className="text-secondary mb-md">
            Enter a new alias for this player (e.g., their Facebook or Meetup
            name) so the system can automatically match their attendances.
          </p>
          <div className="form-group">
            <label className="form-label">Alias Name</label>
            <input
              type="text"
              className="input-field"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              placeholder="e.g. John Smith"
              autoFocus
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  aliasInput.trim() &&
                  !addAliasMutation.isPending
                ) {
                  submitAlias();
                  setShowAliasModal(false);
                  setAliasInput("");
                }
              }}
            />
            <span className="form-hint">
              This alias will be used to match bank transactions and Facebook
              attendance posts.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
};

function EmptyAliasState() {
  return (
    <p className="text-muted">
      <UserX size={16} /> No aliases configured. Add one to enable automatic
      matching.
    </p>
  );
}
