import { useQuery } from "@tanstack/react-query";
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
  Legend,
} from "recharts";
import { Users, DollarSign, Calendar as CalendarIcon } from "lucide-react";

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

export const DashboardPage = () => {
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

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  if (loadingSummary)
    return (
      <div className="page-header">
        <h1 className="page-title">Loading Dashboard...</h1>
      </div>
    );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "var(--spacing-md)",
          marginBottom: "var(--spacing-xl)",
        }}
      >
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-md)",
          }}
        >
          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              color: "var(--primary)",
            }}
          >
            <Users size={24} />
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Active Players
            </p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              {summary?.activePlayers}{" "}
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  fontWeight: 400,
                }}
              >
                / {summary?.totalPlayers}
              </span>
            </p>
          </div>
        </div>

        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-md)",
          }}
        >
          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "var(--danger)",
            }}
          >
            <DollarSign size={24} />
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Outstanding Balance
            </p>
            <p
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color:
                  (summary?.totalOutstandingCents || 0) > 0
                    ? "var(--warning)"
                    : "var(--text-primary)",
              }}
            >
              {formatCurrency(summary?.totalOutstandingCents || 0)}
            </p>
          </div>
        </div>

        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-md)",
          }}
        >
          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              backgroundColor: "rgba(34, 197, 94, 0.1)",
              color: "var(--success)",
            }}
          >
            <CalendarIcon size={24} />
          </div>
          <div>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Games This Month
            </p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              {summary?.gamesThisMonth}{" "}
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  fontWeight: 400,
                }}
              >
                / {summary?.gamesTotal} total
              </span>
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "var(--spacing-lg)",
        }}
      >
        <div className="card">
          <h3
            style={{
              marginBottom: "var(--spacing-lg)",
              fontSize: "1.125rem",
              fontWeight: 600,
            }}
          >
            Financial Overview (6 Months)
          </h3>
          <div style={{ height: "300px" }}>
            {loadingFinance ? (
              <p>Loading chart...</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={finance}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="colorCharges"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--danger)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--danger)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient
                      id="colorPayments"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--success)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--success)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-color)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `$${val / 100}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-color)",
                      borderRadius: "8px",
                      color: "var(--text-primary)",
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    name="Game Charges"
                    dataKey="totalChargesCents"
                    stroke="var(--danger)"
                    fillOpacity={1}
                    fill="url(#colorCharges)"
                  />
                  <Area
                    type="monotone"
                    name="Payments Rcvd"
                    dataKey="totalPaymentsCents"
                    stroke="var(--success)"
                    fillOpacity={1}
                    fill="url(#colorPayments)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <h3
            style={{
              marginBottom: "var(--spacing-lg)",
              fontSize: "1.125rem",
              fontWeight: 600,
            }}
          >
            Recent Attendance
          </h3>
          <div style={{ height: "300px" }}>
            {loadingAttendance ? (
              <p>Loading chart...</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={attendance}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-color)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="gameDate"
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-color)",
                      borderRadius: "8px",
                      color: "var(--text-primary)",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="totalAttendees"
                    name="Total Attendees"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="chargeableAttendees"
                    name="Charged Attendees"
                    fill="var(--warning)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
