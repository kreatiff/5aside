import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; to?: string };

export const Breadcrumbs = ({ items }: { items: Crumb[] }) => (
  <nav className="breadcrumbs">
    {items.map((crumb, i) => {
      const isLast = i === items.length - 1;
      return (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {i > 0 && (
            <span className="breadcrumbs__separator">
              <ChevronRight size={14} />
            </span>
          )}
          {crumb.to && !isLast ? (
            <Link to={crumb.to}>{crumb.label}</Link>
          ) : (
            <span className="breadcrumbs__current">{crumb.label}</span>
          )}
        </span>
      );
    })}
  </nav>
);
