import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  Plus,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const GamesPage = () => {
  const [page, setPage] = useState(0);
  const limit = 20;

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["games", page],
    queryFn: async () => {
      const { data } = await api.get(
        `/games?limit=${limit}&offset=${page * limit}`,
      );
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
      navigate(`/games/${newGame.id}`);
    },
  });

  const handleCreateGame = () => {
    const defaultFee = settings?.current_game_fee_cents || 1000;
    const dateInput = window.prompt(
      "Enter game date (YYYY-MM-DD):",
      new Date().toISOString().substring(0, 10),
    );
    if (dateInput?.trim()) {
      const feeInput = window.prompt(
        `Enter fee in cents (default: ${defaultFee}):`,
        defaultFee.toString(),
      );
      if (feeInput !== null && !isNaN(Number(feeInput))) {
        createGameMutation.mutate({
          gameDate: dateInput.trim(),
          feeCents: Number(feeInput),
        });
      }
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
        <h1 className="page-title">Games</h1>
        <button className="btn btn-primary" onClick={handleCreateGame}>
          <Plus size={16} /> Create Game
        </button>
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
                  Fee
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Attendees
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                  }}
                >
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "16px", textAlign: "center" }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : data?.data?.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: "16px", textAlign: "center" }}
                  >
                    No games found
                  </td>
                </tr>
              ) : (
                data?.data?.map(
                  (game: {
                    id: string;
                    gameDate: string;
                    status: string;
                    feeCents: number;
                    attendanceCount?: number;
                    source: string;
                  }) => (
                    <tr
                      key={game.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                      onClick={() => navigate(`/games/${game.id}`)}
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
                          <CalendarIcon size={20} color="var(--primary)" />
                          {game.gameDate}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "99px",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            backgroundColor:
                              game.status === "completed"
                                ? "rgba(34, 197, 94, 0.1)"
                                : "rgba(59, 130, 246, 0.1)",
                            color:
                              game.status === "completed"
                                ? "var(--success)"
                                : "var(--primary)",
                          }}
                        >
                          {game.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 500 }}>
                        {formatCurrency(game.feeCents)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {game.attendanceCount || 0}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "var(--text-muted)",
                          fontSize: "0.875rem",
                          textTransform: "capitalize",
                        }}
                      >
                        {game.source}
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > limit && (
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
