import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Check, X, Search, RefreshCw, CheckCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable, type Column } from "../components/DataTable";
import { useToast } from "../contexts/ToastContext";
import { formatCurrency, formatDate } from "../utils/format";

type QueueItem = {
  id: string;
  createdAt: string;
  itemType: "bank_transaction" | "attendance";
  payload: {
    descriptionRaw?: string;
    externalTxnId?: string;
    sourceRef?: string;
    amountCents?: number;
    playerName?: string;
  };
  suggestedPlayerId: string | null;
  confidence: number;
};

type Player = {
  id: string;
  displayName: string;
};

export const ReconciliationPage = () => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data: queue, isLoading: loadingQueue } = useQuery({
    queryKey: ["reconciliation"],
    queryFn: async () => {
      const { data } = await api.get(`/reconciliation-queue?limit=10000`);
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

  const rescanMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/reconciliation-queue/rescan");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      addToast(
        "success",
        `Rescan complete. Mapped ${data.transactionsMapped} transactions.`,
      );
    },
  });

  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const getPlayerName = (playerId: string): string => {
    const player = players?.find((p: Player) => p.id === playerId);
    return player?.displayName || "Unknown Player";
  };

  const items: QueueItem[] = useMemo(() => queue?.data ?? [], [queue]);

  const columns: Column<QueueItem>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date",
        sortable: true,
        sortValue: (item) => new Date(item.createdAt).getTime(),
        render: (item) => (
          <span className="text-secondary">
            {formatDate(item.createdAt.split("T")[0])}
          </span>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (item) => (
          <StatusBadge
            variant={item.itemType === "attendance" ? "info" : "success"}
          >
            {item.itemType === "bank_transaction" ? "PAYMENT" : "ATTENDANCE"}
          </StatusBadge>
        ),
      },
      {
        key: "details",
        header: "Details",
        render: (item) => {
          const payload = item.payload;
          if (item.itemType === "bank_transaction") {
            return (
              <div>
                <p className="text-primary mb-xs">
                  <strong>
                    {payload.descriptionRaw} (
                    {payload.externalTxnId || payload.sourceRef || "Manual"})
                  </strong>
                </p>
                <p className="text-success">
                  <strong>{formatCurrency(payload.amountCents ?? 0)}</strong>
                </p>
              </div>
            );
          }
          return (
            <div>
              <p className="text-primary mb-xs">
                <strong>"{payload.playerName}"</strong>
              </p>
              <p className="text-muted text-sm">from Facebook import</p>
            </div>
          );
        },
      },
      {
        key: "suggestion",
        header: "Suggestion",
        render: (item) => {
          if (!item.suggestedPlayerId) {
            return <span className="text-muted">None</span>;
          }
          const confidencePct = Math.round(item.confidence * 100);
          const isHighConfidence = item.confidence > 0.8;
          return (
            <div>
              <Link
                to={`/players/${item.suggestedPlayerId}`}
                className="text-primary"
              >
                <strong>{getPlayerName(item.suggestedPlayerId)}</strong>
              </Link>
              <div className="confidence-bar mt-xs">
                <div className="confidence-bar__track">
                  <div
                    className={`confidence-bar__fill ${isHighConfidence ? "confidence-bar__fill--high" : "confidence-bar__fill--low"}`}
                    role="progressbar"
                    aria-valuenow={confidencePct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <span className="confidence-bar__label">
                  {confidencePct}% Match
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        render: (item) => {
          const isResolving = resolvingId === item.id;

          if (isResolving) {
            return (
              <div className="recon-resolve-panel">
                <select
                  className="input-field"
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
                  {players?.map((p: Player) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setResolvingId(null)}
                >
                  Cancel
                </button>
              </div>
            );
          }

          return (
            <div className="recon-actions">
              {item.suggestedPlayerId && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    resolveMutation.mutate({
                      id: item.id,
                      playerId: item.suggestedPlayerId!,
                    })
                  }
                  title="Accept Suggestion"
                >
                  <Check size={16} /> Accept
                </button>
              )}
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setResolvingId(item.id)}
              >
                <Search size={16} /> Find
              </button>
              <button
                className="btn btn-ghost btn-icon btn-danger"
                onClick={() => dismissMutation.mutate(item.id)}
                title="Dismiss / Ignore"
              >
                <X size={16} />
              </button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvingId, players],
  );

  return (
    <>
      <PageHeader
        title="Reconciliation Queue"
        description="Items here require manual matching because the system couldn't confidently link them to a player."
        actions={
          <button
            className={`btn btn-outline ${rescanMutation.isPending ? "btn-loading" : ""}`}
            onClick={() => rescanMutation.mutate()}
            disabled={rescanMutation.isPending}
          >
            <RefreshCw
              size={18}
              className={rescanMutation.isPending ? "spin" : ""}
            />
            {rescanMutation.isPending ? "Rescanning..." : "Rescan Transactions"}
          </button>
        }
      />

      <DataTable<QueueItem>
        columns={columns}
        data={items}
        isLoading={loadingQueue}
        getRowId={(item) => item.id}
        emptyIcon={<CheckCircle size={48} />}
        emptyTitle="You're all caught up!"
        emptyDescription="No items to reconcile."
      />
    </>
  );
};
