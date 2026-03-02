import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, UserCircle, Plus } from "lucide-react";
import { Modal } from "../components/Modal";

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

export const PlayerDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [showConfirmMerge, setShowConfirmMerge] = useState(false);
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasInput, setAliasInput] = useState("");

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
      const { data } = await api.get(`/players/${id}/ledger?limit=50`);
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
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async (updates: Partial<PlayerDetails>) => {
      await api.patch(`/players/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players", id] });
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
    },
  });

  const handleAddAlias = () => {
    setShowAliasModal(true);
  };

  const submitAlias = () => {
    if (aliasInput.trim()) {
      addAliasMutation.mutate({
        source: "facebook",
        aliasRaw: aliasInput.trim(),
      });
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  if (isLoading)
    return (
      <div className="page-header">
        <h1 className="page-title">Loading...</h1>
      </div>
    );
  if (!player)
    return (
      <div className="page-header">
        <h1 className="page-title">Player Not Found</h1>
      </div>
    );

  return (
    <>
      <div style={{ marginBottom: "var(--spacing-md)" }}>
        <Link
          to="/players"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
          }}
        >
          <ArrowLeft size={16} /> Back to Players
        </Link>
      </div>

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <UserCircle
            size={48}
            color={player.active ? "var(--primary)" : "var(--text-muted)"}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h1 className="page-title" style={{ marginBottom: 0 }}>
                {player.displayName}
              </h1>
              <button
                className={`btn btn-sm ${player.active ? "btn-outline" : "btn-secondary"}`}
                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                onClick={() =>
                  updatePlayerMutation.mutate({ active: !player.active })
                }
                disabled={updatePlayerMutation.isPending}
              >
                {player.active ? "Active" : "Inactive"}
              </button>
            </div>
            <p style={{ color: "var(--text-secondary)", marginTop: "4px" }}>
              Added {new Date(player.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div>
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Current Balance
          </span>
          <p
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              textAlign: "right",
              color:
                player.currentBalanceCents > 0
                  ? "var(--warning)"
                  : "var(--text-primary)",
            }}
          >
            {formatCurrency(player.currentBalanceCents)}
          </p>
        </div>
      </div>

      {/* Merge Controls */}
      <div
        style={{
          marginBottom: "var(--spacing-lg)",
          padding: "16px",
          backgroundColor: "var(--bg-base)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
        }}
      >
        <h4
          style={{ marginBottom: "8px", fontSize: "0.875rem", fontWeight: 600 }}
        >
          Merge Duplicate Profiles
        </h4>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "12px",
          }}
        >
          Select duplicates from the list below to merge into this profile. The
          selected profiles will be permanently deleted and all of their
          ledgers, aliases, and attendance records will be cleanly transferred
          here.
        </p>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div
            style={{
              minHeight: "120px",
              maxHeight: "300px",
              overflowY: "auto",
              fontSize: "0.875rem",
              flex: 1,
              padding: "8px",
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
            }}
          >
            {allPlayers
              ?.filter((p) => p.id !== id)
              .map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "4px 0",
                    cursor: "pointer",
                  }}
                >
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              width: "200px",
            }}
          >
            {!showConfirmMerge ? (
              <button
                className="btn btn-primary"
                disabled={mergeMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (mergeSelection.length === 0) {
                    window.alert(
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
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--warning)",
                    fontWeight: 600,
                    textAlign: "center",
                    margin: "0 0 4px 0",
                  }}
                >
                  Are you absolutely sure?
                </p>
                <button
                  className="btn"
                  style={{
                    backgroundColor: "var(--danger)",
                    color: "white",
                    borderColor: "var(--danger)",
                  }}
                  disabled={mergeMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    mergeMutation.mutate({
                      sourcePlayerIds: mergeSelection,
                      targetPlayerId: id!,
                    });
                  }}
                >
                  Yes, Delete & Merge
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: "var(--spacing-lg)",
        }}
      >
        {/* Aliases Column */}
        <div className="card" style={{ alignSelf: "start" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--spacing-md)",
            }}
          >
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
              Connected Aliases
            </h3>
            <button
              className="btn btn-outline"
              style={{ padding: "4px 8px" }}
              onClick={handleAddAlias}
            >
              <Plus size={16} />
            </button>
          </div>

          {loadingAliases ? (
            <p>Loading...</p>
          ) : aliases?.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              No aliases configured.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {aliases?.map((alias: Alias) => (
                <div
                  key={alias.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    backgroundColor: "var(--bg-base)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{alias.aliasRaw}</span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    {alias.sourceType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ledger Column */}
        <div className="card">
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              marginBottom: "var(--spacing-md)",
            }}
          >
            Recent Transactions
          </h3>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <th
                    style={{
                      padding: "8px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      padding: "8px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: "8px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Amount
                  </th>
                  <th
                    style={{
                      padding: "8px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingLedger ? (
                  <tr>
                    <td colSpan={4}>Loading...</td>
                  </tr>
                ) : ledger?.data?.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  ledger?.data?.map(
                    (entry: {
                      id: string;
                      created_at: string;
                      type: string;
                      amount_cents: number;
                      adjustment_reason?: string;
                    }) => (
                      <tr
                        key={entry.id}
                        style={{
                          borderBottom: "1px solid var(--border-color)",
                        }}
                      >
                        <td
                          style={{ padding: "12px 8px", fontSize: "0.875rem" }}
                        >
                          {new Date(entry.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              textTransform: "uppercase",
                              fontWeight: 600,
                              backgroundColor:
                                entry.type === "charge"
                                  ? "rgba(239, 68, 68, 0.1)"
                                  : entry.type === "payment"
                                    ? "rgba(34, 197, 94, 0.1)"
                                    : "rgba(148, 163, 184, 0.1)",
                              color:
                                entry.type === "charge"
                                  ? "var(--danger)"
                                  : entry.type === "payment"
                                    ? "var(--success)"
                                    : "var(--text-secondary)",
                            }}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td style={{ padding: "12px 8px", fontWeight: 500 }}>
                          {entry.amount_cents >= 0 ? "+" : "-"}
                          {formatCurrency(Math.abs(entry.amount_cents))}
                        </td>
                        <td
                          style={{
                            padding: "12px 8px",
                            fontSize: "0.875rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {entry.type === "charge"
                            ? "Game fee"
                            : entry.type === "adjustment"
                              ? entry.adjustment_reason
                              : "Bank deposit"}
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showAliasModal}
        title="Add New Alias"
        onClose={() => setShowAliasModal(false)}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Enter a new alias for this player (e.g., their Facebook or Meetup
            name) so the system can automatically match their attendances.
          </p>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Alias Name
            </label>
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
          </div>
        </div>
      </Modal>
    </>
  );
};
