import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Banknote, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable, type Column } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { Drawer } from "../components/Drawer";
import { ManualAdjustmentForm } from "../components/ManualAdjustmentForm";
import { formatCurrency, formatDate } from "../utils/format";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

type BankTransaction = {
  id: string;
  externalTxnId: string | null;
  postedAt: string;
  amountCents: number;
  description: string;
  matchedPlayerId: string | null;
  matchedPlayerName: string | null;
  status: "matched" | "pending" | "dismissed";
  createdAt: string;
};

export const TransactionsPage = () => {
  const queryClient = useQueryClient();
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdjustmentOpen = searchParams.get("adjustment") === "true";

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: async () => {
      const { data } = await api.get("/bank-transactions?limit=10000");
      return data;
    },
  });

  const transactions: BankTransaction[] = useMemo(
    () => data?.data ?? [],
    [data],
  );

  const handleSync = async () => {
    setIsSyncModalOpen(true);
    setIsSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const response = await fetch(
        "https://n8n.dominus.casa/webhook/184c96e2-1179-4c20-bf2f-9291b6fa3c15",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Sync failed with status: ${response.status}`);
      }

      const result = await response.json();
      setSyncResult(result);
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      // Also invalidate summary/player data since bank transactions might affect ledgers
      queryClient.invalidateQueries({ queryKey: ["players"] });
    } catch (error: any) {
      setSyncError(error.message || "An unknown error occurred during sync");
    } finally {
      setIsSyncing(false);
    }
  };

  const columns: Column<BankTransaction>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date",
        sortable: true,
        sortValue: (tx) => new Date(tx.postedAt).getTime(),
        render: (tx) => (
          <span className="text-secondary">
            {formatDate(tx.postedAt.split("T")[0])}
          </span>
        ),
      },
      {
        key: "description",
        header: "Description",
        mobileTitle: true,
        render: (tx) => (
          <div className="tx-description">
            <p className="text-primary mb-xs">
              <strong>{tx.description}</strong>
            </p>
            {tx.externalTxnId && (
              <span className="text-muted text-sm">{tx.externalTxnId}</span>
            )}
          </div>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        sortable: true,
        sortValue: (tx) => tx.amountCents,
        render: (tx) => (
          <span className="text-success">
            <strong>{formatCurrency(tx.amountCents)}</strong>
          </span>
        ),
      },
      {
        key: "player",
        header: "Matched Player",
        render: (tx) => {
          if (!tx.matchedPlayerId) {
            return <span className="text-muted">—</span>;
          }
          return (
            <Link
              to={`/players/${tx.matchedPlayerId}`}
              className="text-primary"
            >
              <strong>{tx.matchedPlayerName}</strong>
            </Link>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        render: (tx) => {
          const variant =
            tx.status === "matched"
              ? "success"
              : tx.status === "pending"
                ? "warning"
                : "neutral";
          const label =
            tx.status === "matched"
              ? "Matched"
              : tx.status === "pending"
                ? "Pending"
                : "Dismissed";
          return (
            <StatusBadge variant={variant} dot>
              {label}
            </StatusBadge>
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Bank Transactions"
        description="All imported bank transactions and their matched players."
        actions={
          <div className="flex gap-sm">
            <button
              className="btn btn-outline"
              onClick={() => setSearchParams({ adjustment: "true" })}
            >
              <Plus size={16} style={{ marginRight: "0.5rem" }} />
              Create Adjustment
            </button>
            <button className="btn btn-primary" onClick={handleSync}>
              <RefreshCw
                size={16}
                className={isSyncing ? "spin-animation" : ""}
                style={{ marginRight: "0.5rem" }}
              />
              Sync from Bank
            </button>
          </div>
        }
      />

      <DataTable<BankTransaction>
        columns={columns}
        data={transactions}
        isLoading={isLoading}
        getRowId={(tx) => tx.id}
        mobileLayout="cards"
        emptyIcon={<Banknote size={48} />}
        emptyTitle="No transactions yet"
        emptyDescription="Import bank transactions via CSV or the Pocketsmith webhook."
      />

      <Modal
        isOpen={isSyncModalOpen}
        onClose={() => !isSyncing && setIsSyncModalOpen(false)}
        title="Syncing Bank Transactions"
        size="md"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => setIsSyncModalOpen(false)}
            disabled={isSyncing}
          >
            {isSyncing ? "Please wait..." : "Close"}
          </button>
        }
      >
        <div className="flex-col gap-md">
          {isSyncing && (
            <div className="flex-align gap-sm justify-center py-lg text-primary">
              <RefreshCw size={24} className="spin-animation" />
              <span>Fetching latest transactions from bank...</span>
            </div>
          )}

          {!isSyncing && syncError && (
            <div
              className="toast toast-error mb-0 w-full"
              style={{ position: "relative", transform: "none", opacity: 1 }}
            >
              <p>
                <strong>Sync failed:</strong> {syncError}
              </p>
            </div>
          )}

          {!isSyncing && syncResult && (() => {
            let posted = 0;
            let queued = 0;
            let message = "Sync completed successfully.";
            
            if (Array.isArray(syncResult) && syncResult.length > 0) {
              posted = syncResult.reduce((sum, r) => sum + (r?.posted || 0), 0);
              queued = syncResult.reduce((sum, r) => sum + (r?.queued || 0), 0);
              if (syncResult[0]?.message) message = syncResult[0].message;
              else if (posted === 0 && queued === 0) message = "No new transactions found.";
              else message = `Processed ${posted + queued} transactions.`;
            } else if (syncResult && typeof syncResult === 'object') {
              // PocketSmith via n8n might wrap it in some data object, but let's assume flat
              posted = syncResult.posted || 0;
              queued = syncResult.queued || 0;
              if (syncResult.message) message = syncResult.message;
              else if (posted === 0 && queued === 0) message = "No new transactions found.";
              else message = `Processed ${posted + queued} transactions.`;
            }

            const hasData = posted > 0 || queued > 0;

            return (
              <div className="flex-col gap-sm">
                <div
                  className={`toast mb-0 w-full ${hasData ? 'toast-success' : 'toast-info'}`}
                  style={{
                    position: "relative",
                    transform: "none",
                    opacity: 1,
                    marginBottom: "1rem",
                  }}
                >
                  <p className="m-0">
                    <strong>{message}</strong>
                  </p>
                </div>
                
                {hasData ? (
                  <div className="flex-row gap-md" style={{ display: 'flex' }}>
                    <div className="card text-center p-md flex-1 bg-subtle" style={{ flex: 1 }}>
                      <h2 className="m-0 text-success" style={{ fontSize: "2.5rem" }}>{posted}</h2>
                      <p className="text-sm text-secondary m-0 mt-xs font-medium">Auto-Matched</p>
                    </div>
                    <div className="card text-center p-md flex-1 bg-subtle" style={{ flex: 1 }}>
                      <h2 className="m-0 text-warning" style={{ fontSize: "2.5rem" }}>{queued}</h2>
                      <p className="text-sm text-secondary m-0 mt-xs font-medium">Needs Review</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-md text-muted italic">
                    Everything is up to date. No new transactions to process.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </Modal>

      <Drawer
        isOpen={isAdjustmentOpen}
        onClose={() => setSearchParams({})}
        title="Manual Adjustment"
      >
        <ManualAdjustmentForm onSuccess={() => setSearchParams({})} />
      </Drawer>

      <style>{`
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .justify-center {
          justify-content: center;
        }
        .py-lg {
          padding-top: var(--spacing-lg);
          padding-bottom: var(--spacing-lg);
        }
        .w-full {
          width: 100%;
        }
      `}</style>
    </>
  );
};
