import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  AlertCircle,
  Check,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const ReconciliationPage = () => {
  const [page, setPage] = useState(0);
  const limit = 20;

  const queryClient = useQueryClient();

  const { data: queue, isLoading: loadingQueue } = useQuery({
    queryKey: ["reconciliation", page],
    queryFn: async () => {
      const { data } = await api.get(
        `/reconciliation-queue?limit=${limit}&offset=${page * limit}`,
      );
      return data;
    },
  });

  const { data: players } = useQuery({
    queryKey: ["players", "all-for-recon"],
    queryFn: async () => {
      const { data } = await api.get(`/players?limit=1000`);
      return data.data;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, playerId }: { id: string; playerId: string }) => {
      await api.post(`/reconciliation-queue/${id}/resolve`, { playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/reconciliation-queue/${id}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    },
  });

  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: "4px" }}>
            Reconciliation Queue
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Items here require manual matching because the system couldn't
            confidently link them to a player.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Date
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Details
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Suggestion
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    textAlign: "right",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingQueue ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "16px", textAlign: "center" }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : queue?.data?.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "48px 16px", textAlign: "center" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      <Check size={48} color="var(--success)" opacity={0.5} />
                      <p>You're all caught up! No items to reconcile.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                queue?.data?.map((item: any) => {
                  const payload = item.payload;
                  const isResolving = resolvingId === item.id;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        transition: "background 0.2s",
                        backgroundColor: isResolving
                          ? "var(--bg-elevated)"
                          : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: "16px",
                          fontSize: "0.875rem",
                          verticalAlign: "top",
                        }}
                      >
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "16px", verticalAlign: "top" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            backgroundColor:
                              item.itemType === "attendance"
                                ? "rgba(59, 130, 246, 0.1)"
                                : "rgba(34, 197, 94, 0.1)",
                            color:
                              item.itemType === "attendance"
                                ? "var(--primary)"
                                : "var(--success)",
                            textTransform: "uppercase",
                          }}
                        >
                          {item.itemType}
                        </span>
                      </td>
                      <td style={{ padding: "16px", verticalAlign: "top" }}>
                        {item.itemType === "bank_transaction" ? (
                          <div>
                            <p style={{ fontWeight: 500, marginBottom: "4px" }}>
                              {payload.descriptionRaw} (
                              {payload.externalTxnId ||
                                payload.sourceRef ||
                                "Manual"}
                              )
                            </p>
                            <p
                              style={{
                                color: "var(--success)",
                                fontWeight: 600,
                              }}
                            >
                              {formatCurrency(payload.amountCents)}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p style={{ fontWeight: 500, marginBottom: "4px" }}>
                              "{payload.playerName}"
                            </p>
                            <p
                              style={{
                                color: "var(--text-muted)",
                                fontSize: "0.75rem",
                              }}
                            >
                              from Facebook import
                            </p>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "16px", verticalAlign: "top" }}>
                        {item.suggestedPlayerId ? (
                          <div>
                            <Link
                              to={`/players/${item.suggestedPlayerId}`}
                              style={{
                                fontWeight: 500,
                                color: "var(--primary)",
                              }}
                            >
                              {players?.find(
                                (p: { id: string; displayName: string }) =>
                                  p.id === item.suggestedPlayerId,
                              )?.displayName || "Unknown Player"}
                            </Link>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                marginTop: "4px",
                                fontSize: "0.75rem",
                                color:
                                  item.confidence > 0.8
                                    ? "var(--success)"
                                    : "var(--warning)",
                              }}
                            >
                              <AlertCircle size={12} />
                              {(item.confidence * 100).toFixed(0)}% Match
                            </div>
                          </div>
                        ) : (
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "0.875rem",
                            }}
                          >
                            None
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "16px",
                          verticalAlign: "top",
                          textAlign: "right",
                        }}
                      >
                        {isResolving ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              alignItems: "flex-end",
                              minWidth: "200px",
                            }}
                          >
                            <select
                              className="input-field"
                              style={{ width: "100%", padding: "6px" }}
                              onChange={(e) => {
                                if (e.target.value) {
                                  resolveMutation.mutate({
                                    id: item.id,
                                    playerId: e.target.value,
                                  });
                                  setResolvingId(null);
                                }
                              }}
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Select Player...
                              </option>
                              {players?.map(
                                (p: { id: string; displayName: string }) => (
                                  <option key={p.id} value={p.id}>
                                    {p.displayName}
                                  </option>
                                ),
                              )}
                            </select>
                            <button
                              className="btn btn-outline"
                              style={{
                                fontSize: "0.75rem",
                                padding: "4px 8px",
                              }}
                              onClick={() => setResolvingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              justifyContent: "flex-end",
                            }}
                          >
                            {item.suggestedPlayerId && (
                              <button
                                className="btn btn-primary"
                                style={{
                                  padding: "6px 12px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                                onClick={() =>
                                  resolveMutation.mutate({
                                    id: item.id,
                                    playerId: item.suggestedPlayerId,
                                  })
                                }
                                title="Accept Suggestion"
                              >
                                <Check size={16} /> Accept
                              </button>
                            )}
                            <button
                              className="btn btn-outline"
                              style={{
                                padding: "6px 12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={() => setResolvingId(item.id)}
                            >
                              <Search size={16} /> Find
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{
                                padding: "6px",
                                color: "var(--danger)",
                                borderColor: "transparent",
                                backgroundColor: "rgba(239, 68, 68, 0.1)",
                              }}
                              onClick={() => dismissMutation.mutate(item.id)}
                              title="Dismiss / Ignore"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {queue && queue.total > limit && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <span
              style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}
            >
              Showing {queue.offset + 1} to{" "}
              {Math.min(queue.offset + limit, queue.total)} of {queue.total}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn btn-outline"
                style={{ padding: "4px 8px" }}
                disabled={page === 0}
                onClick={() => setPage((p: number) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="btn btn-outline"
                style={{ padding: "4px 8px" }}
                disabled={(page + 1) * limit >= queue.total}
                onClick={() => setPage((p: number) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
