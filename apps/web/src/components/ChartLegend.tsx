type LegendItem = { label: string; color: string };

export const ChartLegend = ({ items }: { items: LegendItem[] }) => (
  <div style={{ display: "flex", gap: 20, justifyContent: "center", paddingTop: 12 }}>
    {items.map((item) => (
      <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
        <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
          {item.label}
        </span>
      </div>
    ))}
  </div>
);
