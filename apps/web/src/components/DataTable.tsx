import { useState, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";
import { SkeletonTable } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export type Column<T> = {
  key: string;
  header: string;
  render: (item: T, index: number) => ReactNode;
  sortable?: boolean;
  sortValue?: (item: T) => string | number;
  width?: string;
  align?: "left" | "center" | "right";
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
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

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
