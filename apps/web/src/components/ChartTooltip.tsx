import type { TooltipProps } from "recharts";
import { formatCurrency } from "../utils/format";

type ChartTooltipProps = TooltipProps<number, string> & {
  formatValue?: (value: number) => string;
};

export const ChartTooltip = ({ active, payload, label, formatValue }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;

  const fmt = formatValue ?? ((v: number) => formatCurrency(v));

  return (
    <div
      style={{
        background: "rgba(17, 24, 39, 0.9)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(148, 163, 184, 0.15)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        fontSize: "0.8125rem",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 6, fontSize: "0.75rem", fontWeight: 500 }}>
        {label}
      </div>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: entry.color,
            }}
          />
          <span style={{ color: "var(--text-secondary)", minWidth: 70 }}>{entry.name}</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {fmt(entry.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
};
