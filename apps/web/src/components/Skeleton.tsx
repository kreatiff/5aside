type SkeletonTextProps = { width?: string; height?: string };

export const SkeletonText = ({ width = "100%", height = "14px" }: SkeletonTextProps) => (
  <div className="skeleton skeleton-text" style={{ width, height }} />
);

export const SkeletonCard = () => (
  <div className="card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
    <SkeletonText width="40%" height="20px" />
    <SkeletonText width="80%" />
    <SkeletonText width="60%" />
  </div>
);

export const SkeletonStatCard = () => (
  <div className="stat-card">
    <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12 }} />
    <div className="stat-card__content" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SkeletonText width="80px" height="12px" />
      <SkeletonText width="120px" height="24px" />
    </div>
  </div>
);

export const SkeletonTable = ({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
    <div style={{ display: "flex", gap: 16, padding: "12px 16px", borderBottom: "1px solid var(--border-color)" }}>
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonText key={i} width={i === 0 ? "30%" : "18%"} height="10px" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, row) => (
      <div key={row} style={{ display: "flex", gap: 16, padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
        {Array.from({ length: columns }).map((_, col) => (
          <SkeletonText key={col} width={col === 0 ? "30%" : `${14 + Math.random() * 10}%`} />
        ))}
      </div>
    ))}
  </div>
);
