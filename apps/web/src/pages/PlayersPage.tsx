import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Search, Plus, Users } from "lucide-react";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { useToast } from "../contexts/ToastContext";
import { formatDate, getInitials, getAvatarColor } from "../utils/format";

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
  const { addToast } = useToast();

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
      addToast("success", "Player created successfully");
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

  const filteredPlayers = useMemo(() => {
    if (!data?.data) return [];
    if (!search) return data.data;
    return data.data.filter((p: Player) =>
      p.displayName.toLowerCase().includes(search.toLowerCase()),
    );
  }, [data?.data, search]);

  const handleCreatePlayer = () => {
    setShowPlayerModal(true);
  };

  const submitPlayer = () => {
    if (newPlayerName.trim()) {
      createPlayerMutation.mutate(newPlayerName.trim());
    }
  };

  const columns: Column<Player>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        sortable: true,
        sortValue: (p) => p.displayName.toLowerCase(),
        render: (player) => (
          <div className="flex-between gap-sm">
            <div
              className="player-avatar-sm"
              style={{ background: getAvatarColor(player.displayName) }}
            >
              {getInitials(player.displayName)}
            </div>
            <span className="truncate">{player.displayName}</span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        sortValue: (p) => (p.active ? "Active" : "Inactive"),
        width: "120px",
        render: (player) => (
          <StatusBadge
            variant={player.active ? "success" : "neutral"}
            dot
          >
            {player.active ? "Active" : "Inactive"}
          </StatusBadge>
        ),
      },
      {
        key: "balance",
        header: "Balance",
        sortable: true,
        sortValue: (p) => p.currentBalanceCents,
        width: "140px",
        render: (player) => (
          <CurrencyDisplay cents={player.currentBalanceCents} size="sm" colorCode />
        ),
      },
      {
        key: "lastGame",
        header: "Last Game",
        sortable: true,
        sortValue: (p) => p.lastGameDate ?? "",
        width: "140px",
        render: (player) => (
          <span className="text-muted">
            {player.lastGameDate ? formatDate(player.lastGameDate) : "Never"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Players"
        actions={
          <button className="btn btn-primary" onClick={handleCreatePlayer}>
            <Plus size={16} /> Add Player
          </button>
        }
      />

      <div className="card">
        <div className="card-header flex-between gap-md">
          <div className="input-group">
            <Search size={16} className="input-group__icon" />
            <input
              type="text"
              className="input-field"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex-between gap-sm">
            <button
              className={`btn btn-sm ${filter === "active" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter("active")}
            >
              Active Only
            </button>
            <button
              className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter("all")}
            >
              All Players
            </button>
          </div>
        </div>

        {selectedPlayerIds.size > 0 && (
          <div className="card-header flex-between gap-md">
            <span className="text-secondary">
              {selectedPlayerIds.size} player(s) selected
            </span>
            <div className="flex-between gap-sm">
              <button
                className="btn btn-sm btn-success"
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
                className="btn btn-sm btn-outline"
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

        <DataTable
          columns={columns}
          data={filteredPlayers}
          isLoading={isLoading}
          getRowId={(p) => p.id}
          onRowClick={(player) => navigate(`/players/${player.id}`)}
          selectable
          selectedIds={selectedPlayerIds}
          onSelectionChange={setSelectedPlayerIds}
          emptyIcon={<Users size={48} />}
          emptyTitle="No players found"
          emptyDescription={
            search
              ? "Try adjusting your search or filter"
              : "Add your first player to get started"
          }
          emptyAction={
            !search ? (
              <button className="btn btn-primary mt-md" onClick={handleCreatePlayer}>
                <Plus size={16} /> Add Player
              </button>
            ) : undefined
          }
        />
      </div>

      <Modal
        isOpen={showPlayerModal}
        title="Add New Player"
        onClose={() => setShowPlayerModal(false)}
        size="sm"
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
        <div className="form-group">
          <label className="form-label">Player Name</label>
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
      </Modal>
    </>
  );
};
