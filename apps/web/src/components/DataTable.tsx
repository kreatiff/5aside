import { useState, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";
import { SkeletonTable } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { useIsMobile } from "../utils/useIsMobile";

export type Column<T> = {
  key: string;
  header: string;
  render: (item: T, index: number) => ReactNode;
  sortable?: boolean;
  sortValue?: (item: T) => string | number;
  width?: string;
  align?: "left" | "center" | "right";
  /** If true, this column is hidden in mobile card mode */
  mobileHidden?: boolean;
  /** If true, this column is used as the card title */
  mobileTitle?: boolean;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (item: T) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  getRowId: (item: T) => string;
  stickyHeader?: boolean;
  /** On mobile, render rows as stacked cards instead of table rows */
  mobileLayout?: "scroll" | "cards";
  /** Render extra action content at the bottom of each card (mobile only) */
  mobileCardActions?: (item: T) => ReactNode;
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyIcon,
  emptyTitle = "No data",
  emptyDescription,
  emptyAction,
  onRowClick,
  selectable,
  selectedIds,
  onSelectionChange,
  getRowId,
  mobileLayout = "scroll",
  mobileCardActions,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const isMobile = useIsMobile();

  const handleSort = useCallback((col: Column<T>) => {
    if (!col.sortable) return;
    setSort((prev) => {
      if (prev?.key === col.key) {
        return prev.direction === "asc" ? { key: col.key, direction: "desc" } : null;
      }
      return { key: col.key, direction: "asc" };
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const aVal = col.sortValue!(a);
      const bVal = col.sortValue!(b);
      if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }, [data, sort, columns]);

  const allSelected = selectable && data.length > 0 && selectedIds?.size === data.length;

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(getRowId)));
    }
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  if (isLoading) {
    return <SkeletonTable rows={6} columns={columns.length} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  // Mobile card mode
  if (isMobile && mobileLayout === "cards") {
    const titleCol = columns.find((c) => c.mobileTitle);
    const bodyColumns = columns.filter(
      (c) => !c.mobileHidden && !c.mobileTitle,
    );

    return (
      <div>
        {sorted.map((item, i) => {
          const id = getRowId(item);
          const actions = mobileCardActions?.(item);
          return (
            <motion.div
              key={id}
              className="data-table-card"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.2 }}
              onClick={() => onRowClick?.(item)}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") onRowClick(item);
                    }
                  : undefined
              }
            >
              {titleCol && (
                <div className="data-table-card__title">
                  {titleCol.render(item, i)}
                </div>
              )}
              {bodyColumns.map((col) => (
                <div key={col.key} className="data-table-card__row">
                  <span className="data-table-card__label">{col.header}</span>
                  <span className="data-table-card__value">
                    {col.render(item, i)}
                  </span>
                </div>
              ))}
              {actions && (
                <div className="data-table-card__actions">{actions}</div>
              )}
            </motion.div>
          );
        })}
      </div>
    );
  }

  // Standard table mode (desktop, or mobile with scroll layout)
  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.sortable ? "sortable" : ""} ${sort?.key === col.key ? "sorted" : ""} ${col.align === "right" ? "align-right" : col.align === "center" ? "align-center" : ""}`}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => handleSort(col)}
              >
                {col.header}
                {col.sortable && (
                  <span className="sort-icon">
                    {sort?.key === col.key && sort.direction === "desc" ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronUp size={14} />
                    )}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => {
            const id = getRowId(item);
            return (
              <motion.tr
                key={id}
                className={onRowClick ? "clickable" : ""}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
                onClick={() => onRowClick?.(item)}
              >
                {selectable && (
                  <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(id) ?? false}
                      onChange={() => toggleOne(id)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={col.align === "right" ? "align-right" : col.align === "center" ? "align-center" : ""}
                  >
                    {col.render(item, i)}
                  </td>
                ))}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
