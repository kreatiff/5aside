import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Search, Plus, UserCircle } from "lucide-react";
import { Modal } from "../components/Modal";

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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    new Set(),
  );

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["players", filter],
    queryFn: async () => {
      const { data } = await api.get<PaginatedPlayers>(
        `/players?limit=10000${filter === "active" ? "&active=true" : ""}`,
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

  const bulkStatusMutation = useMutation({
    mutationFn: async ({
      playerIds,
      isActive,
    }: {
      playerIds: string[];
      isActive: boolean;
    }) => {
      const { data } = await api.patch("/players/bulk-status", {
        playerIds,
        isActive,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      setSelectedPlayerIds(new Set());
    },
  });

  const filteredPlayers = search
    ? data?.data.filter((p: Player) =>
        p.displayName.toLowerCase().includes(search.toLowerCase()),
      )
    : data?.data;

  const handleCreatePlayer = () => {
    setShowPlayerModal(true);
  };

  const submitPlayer = () => {
    if (newPlayerName.trim()) {
      createPlayerMutation.mutate(newPlayerName.trim());
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked && filteredPlayers) {
      setSelectedPlayerIds(new Set(filteredPlayers.map((p: Player) => p.id)));
    } else {
      setSelectedPlayerIds(new Set());
    }
  };

  const handleSelectPlayer = (
    e: React.ChangeEvent<HTMLInputElement>,
    id: string,
  ) => {
    e.stopPropagation();
    const newSet = new Set(selectedPlayerIds);
    if (e.target.checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedPlayerIds(newSet);
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div
            className="input-group"
            style={{ position: "relative", maxWidth: "300px", flex: 1 }}
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

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className={`btn ${filter === "active" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setFilter("active");
              }}
            >
              Active Only
            </button>
            <button
              className={`btn ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setFilter("all");
              }}
            >
              All Players
            </button>
          </div>
        </div>

        {selectedPlayerIds.size > 0 && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "rgba(59, 130, 246, 0.05)",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--primary)",
              }}
            >
              {selectedPlayerIds.size} player(s) selected
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn btn-primary"
                onClick={() =>
                  bulkStatusMutation.mutate({
                    playerIds: Array.from(selectedPlayerIds),
                    isActive: true,
                  })
                }
                disabled={bulkStatusMutation.isPending}
              >
                Mark Active
              </button>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  bulkStatusMutation.mutate({
                    playerIds: Array.from(selectedPlayerIds),
                    isActive: false,
                  })
                }
                disabled={bulkStatusMutation.isPending}
              >
                Mark Inactive
              </button>
            </div>
          </div>
        )}

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
                <th style={{ padding: "12px 16px", width: "48px" }}>
                  <input
                    type="checkbox"
                    checked={
                      (filteredPlayers?.length ?? 0) > 0 &&
                      selectedPlayerIds.size === filteredPlayers?.length
                    }
                    onChange={handleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
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
                    <td
                      style={{ padding: "12px 16px" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlayerIds.has(player.id)}
                        onChange={(e) => handleSelectPlayer(e, player.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
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
      </div>

      <Modal
        isOpen={showPlayerModal}
        title="Add New Player"
        onClose={() => setShowPlayerModal(false)}
        footer={
          <>
            <button
              className="btn btn-outline"
              onClick={() => setShowPlayerModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!newPlayerName.trim() || createPlayerMutation.isPending}
              onClick={() => {
                submitPlayer();
                setShowPlayerModal(false);
                setNewPlayerName("");
              }}
            >
              Add Player
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
              Player Name
            </label>
            <input
              type="text"
              className="input-field"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="e.g. John Doe"
              autoFocus
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  newPlayerName.trim() &&
                  !createPlayerMutation.isPending
                ) {
                  submitPlayer();
                  setShowPlayerModal(false);
                  setNewPlayerName("");
                }
              }}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};
