import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  Search,
  Plus,
  UserCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Player = {
  id: string;
  displayName: string;
  currentBalanceCents: number;
  active: boolean;
  lastGameDate: string | null;
  createdAt: string;
};

type PaginatedPlayers = {
  data: Player[];
  total: number;
  limit: number;
  offset: number;
};

export const PlayersPage = () => {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const limit = 20;

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["players", page],
    queryFn: async () => {
      const { data } = await api.get<PaginatedPlayers>(
        `/players?limit=${limit}&offset=${page * limit}`,
      );
      return data;
    },
  });

  const createPlayerMutation = useMutation({
    mutationFn: async (displayName: string) => {
      const { data } = await api.post("/players", { displayName });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
    },
  });

  const filteredPlayers = search
    ? data?.data.filter((p: Player) =>
        p.displayName.toLowerCase().includes(search.toLowerCase()),
      )
    : data?.data;

  const handleCreatePlayer = () => {
    const name = window.prompt("Enter player name:");
    if (name?.trim()) {
      createPlayerMutation.mutate(name.trim());
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Players</h1>
        <button className="btn btn-primary" onClick={handleCreatePlayer}>
          <Plus size={16} /> Add Player
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "var(--spacing-md)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div
            className="input-group"
            style={{ position: "relative", maxWidth: "300px" }}
          >
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              className="input-field"
              placeholder="Search players..."
              style={{ paddingLeft: "36px" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

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
                  Name
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Balance
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Last Game
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: "16px", textAlign: "center" }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : filteredPlayers?.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: "16px", textAlign: "center" }}
                  >
                    No players found
                  </td>
                </tr>
              ) : (
                filteredPlayers?.map((player: Player) => (
                  <tr
                    key={player.id}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onClick={() => navigate(`/players/${player.id}`)}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-elevated)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontWeight: 500,
                        }}
                      >
                        <UserCircle size={20} color="var(--text-muted)" />
                        {player.displayName}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "99px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          backgroundColor: player.active
                            ? "rgba(34, 197, 94, 0.1)"
                            : "rgba(148, 163, 184, 0.1)",
                          color: player.active
                            ? "var(--success)"
                            : "var(--text-muted)",
                        }}
                      >
                        {player.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontWeight: 500,
                        color:
                          player.currentBalanceCents > 0
                            ? "var(--warning)"
                            : player.currentBalanceCents < 0
                              ? "var(--success)"
                              : "var(--text-primary)",
                      }}
                    >
                      {formatCurrency(player.currentBalanceCents)}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "var(--text-muted)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {player.lastGameDate || "Never"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!search && data && data.total > limit && (
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
              Showing {data.offset + 1} to{" "}
              {Math.min(data.offset + limit, data.total)} of {data.total}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn btn-outline"
                style={{ padding: "4px 8px" }}
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="btn btn-outline"
                style={{ padding: "4px 8px" }}
                disabled={(page + 1) * limit >= data.total}
                onClick={() => setPage((p) => p + 1)}
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
