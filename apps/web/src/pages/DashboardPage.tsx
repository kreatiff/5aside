import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  DollarSign,
  Calendar as CalendarIcon,
  Plus,
  Upload,
  ArrowRightLeft,
  UserPlus,
  Trophy,
  History,
  Activity,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { ChartTooltip } from "../components/ChartTooltip";
import { ChartLegend } from "../components/ChartLegend";
import { SkeletonStatCard } from "../components/Skeleton";
import { useDashboardGames } from "../hooks/useDashboardGames";
import { GameStatusCard } from "../components/GameStatusCard";

type SummaryData = {
  totalPlayers: number;
  activePlayers: number;
  totalOutstandingCents: number;
  gamesThisMonth: number;
  gamesTotal: number;
};

type FinanceData = {
  month: string;
  totalChargesCents: number;
  totalPaymentsCents: number;
  netCents: number;
};

type Player = {
  id: string;
  displayName: string;
  currentBalanceCents: number;
  active: boolean;
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { games, isLoading: loadingGames } = useDashboardGames();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const { data } = await api.get<{ summary: SummaryData }>(
        "/dashboard/summary",
      );
      return data.summary;
    },
  });

  const { data: finance, isLoading: loadingFinance } = useQuery({
    queryKey: ["dashboard", "finance"],
    queryFn: async () => {
      const { data } = await api.get<{ finance: FinanceData[] }>(
        "/dashboard/finance?months=6",
      );
      return data.finance;
    },
  });

  const { data: players } = useQuery({
    queryKey: ["players", "debtors"],
    queryFn: async () => {
      const { data } = await api.get<{ data: Player[] }>(
        "/players?limit=1000&active=true",
      );
      return data.data;
    },
  });

  const topDebtors = (players ?? [])
    .filter((p) => p.currentBalanceCents > 0)
    .sort((a, b) => b.currentBalanceCents - a.currentBalanceCents)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard Overview"
        description="Actionable insights into your 5-a-side community finances."
      />

      {/* KPI Cards */}
      <div
        className="stat-grid mb-lg"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {loadingSummary ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard
              icon={<Users size={24} />}
              label="Active Players"
              value={summary?.activePlayers ?? 0}
              subValue={`/ ${summary?.totalPlayers ?? 0} total`}
              accentColor="var(--primary)"
              index={0}
            />
            <StatCard
              icon={<DollarSign size={24} />}
              label="Outstanding Balance"
              value={
                <CurrencyDisplay
                  cents={summary?.totalOutstandingCents ?? 0}
                  size="xl"
                  animated
                />
              }
              accentColor="var(--danger)"
              index={1}
            />
            <StatCard
              icon={<CalendarIcon size={24} />}
              label="Games This Month"
              value={summary?.gamesThisMonth ?? 0}
              subValue={`/ ${summary?.gamesTotal ?? 0} total`}
              accentColor="var(--warning)"
              index={2}
            />
          </>
        )}
      </div>

      {/* 60/40 Split Content - NEW GAME-FIRST APPROACH */}
      <div className="dashboard-split">
        {/* Left Column (60%) - Recent Activity Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <History size={20} className="text-secondary" />
              Recent Games Activity
            </h3>
            <Link to="/games" style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              View All Games
            </Link>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {loadingGames ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card" style={{ height: 200, width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <div className="skeleton" style={{ height: "100%", width: "100%" }} />
                </div>
              ))
            ) : (games?.length ?? 0) === 0 ? (
               <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                 <Activity size={48} style={{ marginBottom: "1rem", opacity: 0.2 }} />
                 <p>No recent games found. Create one to get started!</p>
               </div>
            ) : (
              games.map((game, i) => (
                <GameStatusCard key={game.id} game={game} index={i} />
              ))
            )}
          </div>
        </div>

        {/* Right Column (40%) - Financial Insights & Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DollarSign size={20} className="text-secondary" />
            Financial Overview
          </h3>
          <div className="card" style={{ padding: "1.25rem" }}>
            <div style={{ height: 220 }}>
              {loadingFinance ? (
                <div className="skeleton" style={{ width: "100%", height: "100%" }} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={finance} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillCharges" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="var(--danger)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fillPayments" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(0,0,0,0.03)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 100}`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" name="Charges" dataKey="totalChargesCents" stroke="var(--danger)" strokeWidth={2} fill="url(#fillCharges)" />
                    <Area type="monotone" name="Payments" dataKey="totalPaymentsCents" stroke="var(--primary)" strokeWidth={2} fill="url(#fillPayments)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <ChartLegend
              items={[
                { label: "Charges", color: "var(--danger)" },
                { label: "Payments", color: "var(--primary)" },
              ]}
            />
          </div>

          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Trophy size={20} className="text-secondary" />
            Current Top Debtors
          </h3>
          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {topDebtors.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)", textAlign: "center", padding: "1rem 0" }}>
                No outstanding balances
              </p>
            ) : (
              topDebtors.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--bg-base)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                    {i + 1}
                  </div>
                  <Link to={`/players/${p.id}`} style={{ flex: 1, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                    {p.displayName}
                  </Link>
                  <div style={{ textAlign: "right" }}>
                    <CurrencyDisplay cents={p.currentBalanceCents} size="sm" color="var(--danger)" />
                  </div>
                </div>
              ))
            )}
          </div>

          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Quick Actions</h3>
          <div className="card" style={{ padding: "1.25rem" }}>
            <div className="quick-actions-grid">
              <button className="btn btn-outline btn-sm" onClick={() => navigate("/games")}>
                <Plus size={16} />
                <span>Create Game</span>
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate("/imports")}>
                <Upload size={16} />
                <span>Import CSV</span>
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate("/reconciliation")}>
                <ArrowRightLeft size={16} />
                <span>Recon Queue</span>
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate("/players")}>
                <UserPlus size={16} />
                <span>Add Player</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
