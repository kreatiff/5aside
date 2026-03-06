import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Banknote } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable, type Column } from "../components/DataTable";
import { formatCurrency, formatDate } from "../utils/format";

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
      />

      <DataTable<BankTransaction>
        columns={columns}
        data={transactions}
        isLoading={isLoading}
        getRowId={(tx) => tx.id}
        emptyIcon={<Banknote size={48} />}
        emptyTitle="No transactions yet"
        emptyDescription="Import bank transactions via CSV or the Pocketsmith webhook."
      />
    </>
  );
};
