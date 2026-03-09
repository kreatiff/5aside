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
  BarChart,
  Bar,
} from "recharts";
import {
  Users,
  DollarSign,
  Calendar as CalendarIcon,
  Plus,
  Upload,
  ArrowRightLeft,
  UserPlus,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { CurrencyDisplay } from "../components/CurrencyDisplay";
import { ChartTooltip } from "../components/ChartTooltip";
import { ChartLegend } from "../components/ChartLegend";
import { SkeletonStatCard } from "../components/Skeleton";
import { formatCurrency } from "../utils/format";

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

type AttendanceData = {
  gameDate: string;
  totalAttendees: number;
  chargeableAttendees: number;
};

type Player = {
  id: string;
  displayName: string;
  currentBalanceCents: number;
  active: boolean;
};

export const DashboardPage = () => {
  const navigate = useNavigate();

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

  const { data: attendance, isLoading: loadingAttendance } = useQuery({
    queryKey: ["dashboard", "attendance"],
    queryFn: async () => {
      const { data } = await api.get<{ attendance: AttendanceData[] }>(
        "/dashboard/attendance?limit=10",
      );
      return data.attendance;
    },
  });

  const { data: players } = useQuery({
    queryKey: ["players", "debtors"],
    queryFn: async () => {
      const { data } = await api.get<{ players: Player[] }>(
        "/players?limit=1000&active=true",
      );
      return data.players;
    },
  });

  const topDebtors = (players ?? [])
    .filter((p) => p.currentBalanceCents > 0)
    .sort((a, b) => b.currentBalanceCents - a.currentBalanceCents)
    .slice(0, 5);

  const maxDebt = topDebtors[0]?.currentBalanceCents ?? 1;

  return (
    <>
      <PageHeader
        title="Dashboard Overview"
        description="At-a-glance summary of financial health and operations."
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
              accentColor="var(--success)"
              index={2}
            />
          </>
        )}
      </div>

      {/* 60/40 Split Content */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
          gap: "2rem",
          marginBottom: "var(--spacing-lg)",
        }}
      >
        {/* Left Column (60%) */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
              Financial Overview
            </h3>
          </div>
          <div className="card" style={{ padding: "1.5rem" }}>
            <div style={{ height: 280 }}>
              {loadingFinance ? (
                <div
                  className="skeleton"
                  style={{ width: "100%", height: "100%", borderRadius: 8 }}
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={finance}
                    margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="fillCharges"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#ef4444"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor="#ef4444"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="fillPayments"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#22c55e"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor="#22c55e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(148,163,184,0.06)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v / 100}`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      name="Charges"
                      dataKey="totalChargesCents"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#fillCharges)"
                      animationDuration={1200}
                    />
                    <Area
                      type="monotone"
                      name="Payments"
                      dataKey="totalPaymentsCents"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#fillPayments)"
                      animationDuration={1200}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <ChartLegend
              items={[
                { label: "Charges", color: "#ef4444" },
                { label: "Payments", color: "#22c55e" },
              ]}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.5rem",
            }}
          >
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
              Recent Attendance
            </h3>
          </div>
          <div className="card" style={{ padding: "1.5rem" }}>
            <div style={{ height: 280 }}>
              {loadingAttendance ? (
                <div
                  className="skeleton"
                  style={{ width: "100%", height: "100%", borderRadius: 8 }}
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={attendance}
                    margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="barTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#14b8a6"
                          stopOpacity={0.9}
                        />
                        <stop
                          offset="100%"
                          stopColor="#14b8a6"
                          stopOpacity={0.4}
                        />
                      </linearGradient>
                      <linearGradient
                        id="barCharged"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#f59e0b"
                          stopOpacity={0.9}
                        />
                        <stop
                          offset="100%"
                          stopColor="#f59e0b"
                          stopOpacity={0.4}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(148,163,184,0.06)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="gameDate"
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<ChartTooltip formatValue={(v) => String(v)} />}
                    />
                    <Bar
                      dataKey="totalAttendees"
                      name="Total"
                      fill="url(#barTotal)"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1200}
                    />
                    <Bar
                      dataKey="chargeableAttendees"
                      name="Charged"
                      fill="url(#barCharged)"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1200}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <ChartLegend
              items={[
                { label: "Total Attendees", color: "#14b8a6" },
                { label: "Charged", color: "#f59e0b" },
              ]}
            />
          </div>
        </div>

        {/* Right Column (40%) */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Pending Actions & Debtors
          </h3>
          <div
            className="card"
            style={{
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {topDebtors.length === 0 ? (
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "var(--font-sm)",
                  textAlign: "center",
                  padding: "var(--spacing-lg) 0",
                }}
              >
                No outstanding balances
              </p>
            ) : (
              topDebtors.map((p, i) => (
                <div className="debtor-row" key={p.id}>
                  <span className="debtor-rank">{i + 1}</span>
                  <Link to={`/players/${p.id}`} className="debtor-name">
                    {p.displayName}
                  </Link>
                  <div className="debtor-bar">
                    <div
                      className="debtor-bar__fill"
                      style={{
                        width: `${(p.currentBalanceCents / maxDebt) * 100}%`,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "var(--font-sm)",
                      fontWeight: 600,
                      color: "var(--danger)",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 70,
                      textAlign: "right",
                    }}
                  >
                    {formatCurrency(p.currentBalanceCents)}
                  </span>
                </div>
              ))
            )}
          </div>

          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              margin: 0,
              marginTop: "1rem",
            }}
          >
            Quick Actions
          </h3>
          <div className="card" style={{ padding: "1.5rem" }}>
            <div
              className="quick-actions-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "1rem",
              }}
            >
              <button
                className="quick-action-btn"
                onClick={() => navigate("/games")}
              >
                <Plus size={18} />
                <span>Create Game</span>
              </button>
              <button
                className="quick-action-btn"
                onClick={() => navigate("/imports")}
              >
                <Upload size={18} />
                <span>Import CSV</span>
              </button>
              <button
                className="quick-action-btn"
                onClick={() => navigate("/reconciliation")}
              >
                <ArrowRightLeft size={18} />
                <span>Recon Queue</span>
              </button>
              <button
                className="quick-action-btn"
                onClick={() => navigate("/players")}
              >
                <UserPlus size={18} />
                <span>Add Player</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
