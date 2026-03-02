import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { useToast } from "../contexts/ToastContext";
import { formatDate } from "../utils/format";

type Game = {
  id: string;
  gameDate: string;
  status: string;
  feeCents: number;
  attendanceCount?: number;
  source: string;
};

function getStatusVariant(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    case "pending":
      return "info";
    default:
      return "neutral";
  }
}

const columns: Column<Game>[] = [
  {
    key: "gameDate",
    header: "Date",
    sortable: true,
    sortValue: (game) => game.gameDate,
    render: (game) => (
      <span className="data-table__date-cell">
        <CalendarIcon size={20} className="text-primary" />
        {formatDate(game.gameDate)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (game) => (
      <StatusBadge variant={getStatusVariant(game.status)} dot>
        {game.status}
      </StatusBadge>
    ),
  },
  {
    key: "feeCents",
    header: "Fee",
    render: (game) => <CurrencyDisplay cents={game.feeCents} size="sm" colorCode={false} />,
  },
  {
    key: "attendanceCount",
    header: "Attendees",
    render: (game) => game.attendanceCount || 0,
  },
  {
    key: "source",
    header: "Source",
    render: (game) => <span className="text-muted text-capitalize">{game.source}</span>,
  },
];

export const GamesPage = () => {
  const [showGameModal, setShowGameModal] = useState(false);
  const [newGameDate, setNewGameDate] = useState(
    new Date().toISOString().substring(0, 10),
  );
  const [newGameFee, setNewGameFee] = useState("");

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addToast } = useToast();

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
      addToast("success", "Game created successfully");
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

  const games: Game[] = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Games"
        actions={
          <button className="btn btn-primary" onClick={handleCreateGame}>
            <Plus size={16} /> Create Game
          </button>
        }
      />

      <DataTable<Game>
        columns={columns}
        data={games}
        isLoading={isLoading}
        getRowId={(game) => game.id}
        onRowClick={(game) => navigate(`/games/${game.id}`)}
        emptyIcon={<CalendarIcon size={48} />}
        emptyTitle="No games yet"
        emptyDescription="Create your first game to start tracking attendance and fees."
      />

      <Modal
        isOpen={showGameModal}
        title="Create New Game"
        onClose={() => setShowGameModal(false)}
        size="sm"
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
        <div className="form-group">
          <label className="form-label">Game Date</label>
          <input
            type="date"
            className="input-field"
            value={newGameDate}
            onChange={(e) => setNewGameDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Fee (in cents)</label>
          <div className="input-group">
            <span className="input-group__prefix">$</span>
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
          <span className="form-hint">Amount in cents (e.g. 1000 = $10.00)</span>
        </div>
      </Modal>
    </>
  );
};
