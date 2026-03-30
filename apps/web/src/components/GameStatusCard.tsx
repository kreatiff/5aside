import { motion } from "framer-motion";
import { Copy, ArrowRight, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { EnrichedGame } from "../hooks/useDashboardGames";
import { formatDate } from "../utils/format";
import { CurrencyDisplay } from "./CurrencyDisplay";
import { StatusBadge } from "./StatusBadge";
import { useToast } from "../contexts/ToastContext";

type GameStatusCardProps = {
  game: EnrichedGame;
  index: number;
};

export const GameStatusCard = ({ game, index }: GameStatusCardProps) => {
  const { addToast } = useToast();
  const paymentStatus = game.paymentStatus;

  const unpaidPlayers = (paymentStatus?.playerStatuses ?? [])
    .filter((p) => p.status === "unpaid" || p.status === "partial");

  const totalExpected = paymentStatus?.summary.totalExpectedCents ?? 0;
  const totalPaid = paymentStatus?.summary.totalPaidCents ?? 0;
  const progress = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;

  const copyUnpaidList = () => {
    const list = unpaidPlayers.map((p) => p.displayName).join(", ");
    if (list) {
      const text = `Unpaid for ${formatDate(game.gameDate)}: ${list}`;
      navigator.clipboard.writeText(text);
      addToast("success", "Unpaid list copied to clipboard");
    } else {
      addToast("info", "All players have paid for this game");
    }
  };

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h4 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, fontFamily: "var(--font-family-display)" }}>
            Game {formatDate(game.gameDate)}
          </h4>
        </div>
        <StatusBadge
          variant={progress === 100 ? "success" : progress > 0 ? "warning" : "danger"}
          dot={progress < 100}
          pulse={progress < 100 && progress > 0}
        >
          {progress === 100 ? "Fully Paid" : `${Math.round(progress)}% Paid`}
        </StatusBadge>
      </div>

      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)" }}>
          <Users size={16} />
          <span style={{ fontSize: "var(--font-sm)", fontWeight: 500 }}>
            {game.attendanceCount} players
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CurrencyDisplay cents={totalPaid} size="sm" color="var(--primary)" />
          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
            of <CurrencyDisplay cents={totalExpected} size="xs" />
          </span>
        </div>
      </div>

      <div style={{ height: "4px", background: "var(--primary-50)", borderRadius: "2px", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: index * 0.1 + 0.4 }}
          style={{
            height: "100%",
            background: progress === 100 ? "var(--success)" : "var(--warning)",
          }}
        />
      </div>

      {unpaidPlayers.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", width: "100%", marginBottom: "0.1rem", fontWeight: 600 }}>
            UNPAID DEBTORS:
          </span>
          {unpaidPlayers.map(p => (
            <span
              key={p.playerId}
              className="badge badge-danger"
              style={{ padding: "2px 8px", fontSize: "10px", fontWeight: 700, borderRadius: "0px", textTransform: "uppercase" }}
            >
              {p.displayName}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--success)" }} />
          ALL PAYMENTS RECONCILED
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "auto" }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={copyUnpaidList}
          style={{ flex: 1, gap: "0.5rem" }}
        >
          <Copy size={14} />
          <span>Copy Unpaid</span>
        </button>
        <Link
          to={`/games/${game.id}`}
          className="btn btn-primary btn-sm"
          style={{ flex: 1, gap: "0.5rem" }}
        >
          <span>View Game</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </motion.div>
  );
};
