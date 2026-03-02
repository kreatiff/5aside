import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { Modal } from "../components/Modal";

export const GamesPage = () => {
  const [showGameModal, setShowGameModal] = useState(false);
  const [newGameDate, setNewGameDate] = useState(
    new Date().toISOString().substring(0, 10),
  );
  const [newGameFee, setNewGameFee] = useState("");

  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
      </div>

      <Modal
        isOpen={showGameModal}
        title="Create New Game"
        onClose={() => setShowGameModal(false)}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Game Date (YYYY-MM-DD)
            </label>
            <input
              type="text"
              className="input-field"
              value={newGameDate}
              onChange={(e) => setNewGameDate(e.target.value)}
              placeholder="e.g. 2025-01-01"
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Fee (in cents)
            </label>
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
        </div>
      </Modal>
    </>
  );
};
