import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, UserCircle, Plus } from "lucide-react";

type PlayerDetails = {
  id: string;
  displayName: string;
  createdAt: string;
  currentBalanceCents: number;
};

type Alias = {
  id: string;
  aliasRaw: string;
  sourceType: string;
};

export const PlayerDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();

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

  const handleAddAlias = () => {
    const raw = window.prompt("Enter new alias (e.g. facebook name):");
    if (raw?.trim()) {
      addAliasMutation.mutate({ source: "facebook", aliasRaw: raw.trim() });
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
          <UserCircle size={48} color="var(--primary)" />
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>
              {player.displayName}
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>
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
    </>
  );
};
