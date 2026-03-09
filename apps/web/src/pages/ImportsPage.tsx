import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Upload, FileText, Copy, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";

import { useToast } from "../contexts/ToastContext";
import { formatDate, formatDateTime, formatCurrency } from "../utils/format";

type ImportRecord = {
  id: string;
  createdAt: string;
  sourceType: string;
  status: string;
  recordCount: number;
  errorDetails?: string;
};

type PreviewRow = {
  postedAtUtc: string;
  amountCents: number;
  descriptionRaw: string;
  externalTxnId?: string;
  sourceRef?: string;
  duplicate: boolean;
};

type ImportItem = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  status: "processed" | "queued";
  type: "bank" | "attendance";
};

const ImportAccordion = ({ imp }: { imp: ImportRecord }) => {
  const [expanded, setExpanded] = useState(false);

  // Setup the nested query
  const { data, isLoading } = useQuery({
    queryKey: ["import_items", imp.id],
    queryFn: async () => {
      const { data } = await api.get(`/imports/${imp.id}/items`);
      return data.items as ImportItem[];
    },
    enabled: expanded,
  });

  return (
    <div className="card mb-sm p-0" style={{ overflow: "hidden" }}>
      <div
        className="card-header border-b-0 cursor-pointer hover:bg-subtle transition-colors"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", transition: "background-color 0.2s ease" }}
      >
        <div className="flex-col gap-xs flex-1">
          <div className="flex-row justify-between align-center">
            <h4 style={{ margin: 0 }}>
              {formatDateTime(imp.createdAt)}{" "}
              <span className="text-muted font-normal ml-xs">
                ({imp.sourceType})
              </span>
            </h4>
            <div className="flex-row align-center gap-sm">
              <StatusBadge
                variant={
                  imp.status === "success" || imp.status === "completed"
                    ? "success"
                    : "danger"
                }
                dot
              >
                {imp.status}
              </StatusBadge>
            </div>
          </div>
          <p className="text-secondary mb-0">
            {imp.recordCount} processed{" "}
            {imp.errorDetails ? `- ${imp.errorDetails}` : ""}
          </p>
        </div>
      </div>

      {expanded && (
        <div
          className="p-md pt-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {isLoading ? (
            <div className="text-muted text-center py-md">Loading items...</div>
          ) : data && data.length > 0 ? (
            <div
              className="data-table-wrapper mt-md"
              style={{
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                margin: 0,
              }}
            >
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.date)}</td>
                      <td>
                        <StatusBadge variant="neutral">{item.type}</StatusBadge>
                      </td>
                      <td className="truncate" style={{ maxWidth: 300 }}>
                        {item.description}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: 500,
                          color:
                            item.amount_cents > 0
                              ? "var(--success)"
                              : "var(--danger)",
                        }}
                      >
                        {formatCurrency(item.amount_cents)}
                      </td>
                      <td>
                        <StatusBadge
                          variant={
                            item.status === "processed" ? "success" : "warning"
                          }
                        >
                          {item.status}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="text-muted text-center py-md bg-subtle mt-md"
              style={{ borderRadius: "var(--radius-sm)" }}
            >
              No items found for this import.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ImportsPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Preview state
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data } = await api.get(`/imports?limit=10000`);
      return data;
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      // Reset preview when new file selected
      setPreviewRows(null);
      setDiscardedIds(new Set());
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setFile(dropped);
      setPreviewRows(null);
      setDiscardedIds(new Set());
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // Step 1: Preview the CSV
  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      setCsvText(text);
      const { data } = await api.post("/imports/bank-csv/preview", {
        csv: text,
      });
      setPreviewRows(data.rows);
      setDuplicateCount(data.duplicateCount);
      setDiscardedIds(new Set());
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast("error", e.response?.data?.error || "Failed to parse CSV");
    } finally {
      setUploading(false);
    }
  };

  // Step 2: Confirm import (only non-duplicate, non-discarded rows)
  const handleConfirmImport = async () => {
    if (!csvText) return;

    setImporting(true);
    try {
      const { data } = await api.post("/imports/bank-csv", {
        csv: csvText,
        excludeExternalIds: Array.from(excludeIds),
      });
      addToast(
        "success",
        `Imported successfully. Processed ${data.posted + data.queued} transactions (${data.posted} posted, ${data.queued} queued for reconciliation).`,
      );
      setFile(null);
      setCsvText(null);
      setPreviewRows(null);
      setDiscardedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast("error", e.response?.data?.error || "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const handleCancelPreview = () => {
    setPreviewRows(null);
    setCsvText(null);
    setDiscardedIds(new Set());
  };

  const toggleDiscard = (externalTxnId: string) => {
    setDiscardedIds((prev) => {
      const next = new Set(prev);
      if (next.has(externalTxnId)) {
        next.delete(externalTxnId);
      } else {
        next.add(externalTxnId);
      }
      return next;
    });
  };

  // Derived data
  const nonDuplicateRows = previewRows?.filter((r) => !r.duplicate) ?? [];
  const excludeIds = new Set([
    ...(previewRows
      ?.filter((r) => r.duplicate)
      .map((r) => r.externalTxnId!)
      .filter(Boolean) ?? []),
    ...Array.from(discardedIds),
  ]);
  const importableRows = nonDuplicateRows.filter(
    (r) => !r.externalTxnId || !discardedIds.has(r.externalTxnId),
  );

  const handleCopyWebhookUrl = useCallback(() => {
    const url = `${window.location.origin}/api/imports/webhook`;
    navigator.clipboard.writeText(url).then(() => {
      addToast("success", "Webhook URL copied to clipboard");
    });
  }, [addToast]);

  const imports: ImportRecord[] = useMemo(() => data?.data ?? [], [data]);

  return (
    <>
      <PageHeader title="Bank Imports" />

      <div
        className="flex-col gap-lg"
        style={{ maxWidth: 800, margin: "0 auto" }}
      >
        {/* ACTION BUTTON TO TOGGLE UPLOAD PANEL */}
        <div className="flex-row justify-between align-center mb-md">
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Import History</h2>
          <button
            className={`btn ${showUpload ? "btn-outline" : "btn-primary"}`}
            onClick={() => setShowUpload(!showUpload)}
          >
            {showUpload ? "Cancel Upload" : "Upload New CSV"}
          </button>
        </div>

        {/* UPLOAD PANEL (COLLAPSIBLE) */}
        {showUpload && (
          <div
            className="card shadow-md scale-in mb-lg"
            style={{ border: "1px solid var(--primary-light)" }}
          >
            <div className="card-header border-b-0 pb-0">
              <h3
                className="card-header__title"
                style={{ fontSize: "1.25rem" }}
              >
                <Upload size={20} className="text-primary" />
                Upload CSV Statement
              </h3>
            </div>

            <div className="p-lg pt-md">
              {!previewRows ? (
                <>
                  <p
                    className="text-secondary mb-md"
                    style={{ fontSize: "1rem" }}
                  >
                    Drop a bank statement in CSV format below. The system will
                    detect duplicates and present a preview before processing
                    the ledger.
                  </p>

                  <form onSubmit={handlePreview}>
                    <div
                      className={`upload-zone py-xl ${dragOver ? "drag-over" : ""} ${file ? "upload-zone--selected" : ""}`}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      style={{
                        borderStyle: "dashed",
                        backgroundColor: file
                          ? "var(--primary-light)"
                          : "var(--bg-subtle)",
                      }}
                    >
                      <input
                        type="file"
                        accept=".csv"
                        id="csv-upload"
                        onChange={handleFileChange}
                        hidden
                      />
                      <label
                        htmlFor="csv-upload"
                        className="upload-zone__label cursor-pointer w-full text-center"
                      >
                        <div className="mb-sm text-primary">
                          <FileText size={48} style={{ margin: "0 auto" }} />
                        </div>
                        <span
                          className="upload-zone__text block font-medium"
                          style={{ fontSize: "1.1rem" }}
                        >
                          {file ? file.name : "Click to select CSV file"}
                        </span>
                        <span className="upload-zone__hint block text-muted mt-xs">
                          or drag and drop here
                        </span>
                      </label>
                    </div>

                    <div className="flex-row justify-end mt-md gap-sm">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setShowUpload(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={`btn btn-primary ${uploading ? "btn-loading" : ""}`}
                        disabled={!file || uploading}
                      >
                        {uploading ? "Analyzing..." : "Preview Import"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  {/* Preview summary */}
                  <div
                    className="mb-md p-md bg-subtle"
                    style={{
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <p className="text-secondary mb-sm">
                      <strong>{previewRows.length}</strong> transactions found
                      in CSV.
                      {duplicateCount > 0 && (
                        <span className="text-warning">
                          {" "}
                          <strong>{duplicateCount}</strong> duplicate
                          {duplicateCount !== 1 ? "s" : ""} already in database
                          (auto-excluded).
                        </span>
                      )}
                      {discardedIds.size > 0 && (
                        <span className="text-muted">
                          {" "}
                          <strong>{discardedIds.size}</strong> manually
                          excluded.
                        </span>
                      )}
                    </p>
                    <p className="text-success" style={{ fontSize: "1.1rem" }}>
                      <strong>{importableRows.length}</strong> new transaction
                      {importableRows.length !== 1 ? "s" : ""} will be
                      processed.
                    </p>
                  </div>

                  {/* Preview table */}
                  <div
                    className="data-table-wrapper"
                    style={{
                      maxHeight: 400,
                      overflowY: "auto",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <table className="data-table m-0">
                      <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                        <tr>
                          <th style={{ width: 40, padding: "0.5rem" }}></th>
                          <th>Date</th>
                          <th>Description</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nonDuplicateRows.map((row, idx) => {
                          const id = row.externalTxnId || `row-${idx}`;
                          const isDiscarded = row.externalTxnId
                            ? discardedIds.has(row.externalTxnId)
                            : false;
                          return (
                            <tr
                              key={id}
                              style={{
                                opacity: isDiscarded ? 0.4 : 1,
                                backgroundColor: isDiscarded
                                  ? "var(--bg-subtle)"
                                  : undefined,
                              }}
                              className="transition-opacity"
                            >
                              <td style={{ padding: "0.5rem" }}>
                                {row.externalTxnId && (
                                  <button
                                    className={`btn btn-ghost btn-icon btn-sm ${isDiscarded ? "" : "text-danger"}`}
                                    onClick={() =>
                                      toggleDiscard(row.externalTxnId!)
                                    }
                                    title={
                                      isDiscarded
                                        ? "Include this transaction"
                                        : "Exclude this transaction"
                                    }
                                  >
                                    {isDiscarded ? (
                                      <span
                                        style={{
                                          fontSize: "1.2rem",
                                          lineHeight: 1,
                                        }}
                                      >
                                        +
                                      </span>
                                    ) : (
                                      <X size={16} />
                                    )}
                                  </button>
                                )}
                              </td>
                              <td className="text-secondary">
                                {formatDate(row.postedAtUtc)}
                              </td>
                              <td
                                className="truncate"
                                style={{ maxWidth: 250, fontWeight: 500 }}
                              >
                                {row.descriptionRaw}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  color: "var(--text-primary)",
                                  fontWeight: 500,
                                }}
                              >
                                {formatCurrency(row.amountCents)}
                              </td>
                              <td>
                                {isDiscarded ? (
                                  <StatusBadge variant="neutral">
                                    excluded
                                  </StatusBadge>
                                ) : (
                                  <StatusBadge variant="success">
                                    ready
                                  </StatusBadge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Action buttons */}
                  <div className="flex-row gap-sm justify-end mt-lg pt-md pb-xs">
                    <button
                      className="btn btn-outline"
                      onClick={handleCancelPreview}
                      disabled={importing}
                    >
                      Clear Preview
                    </button>
                    <button
                      className={`btn btn-primary ${importing ? "btn-loading" : ""}`}
                      onClick={handleConfirmImport}
                      disabled={importing || importableRows.length === 0}
                    >
                      {importing
                        ? "Importing & Resolving..."
                        : `Import ${importableRows.length} Transaction${importableRows.length !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* IMPORT HISTORY LIST */}
        <div className="flex-col gap-sm">
          {isLoading ? (
            <div className="flex-col gap-sm">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="card skeleton bg-subtle"
                  style={{ height: 80 }}
                />
              ))}
            </div>
          ) : imports.length === 0 ? (
            <div className="card text-center py-xl">
              <FileText size={48} className="text-muted mb-md mx-auto" />
              <h3 className="text-secondary mb-xs">No imports recorded</h3>
              <p className="text-muted">Upload a bank CSV to get started.</p>
            </div>
          ) : (
            imports.map((imp) => <ImportAccordion key={imp.id} imp={imp} />)
          )}
        </div>

        {/* WEBHOOKS INFO */}
        <div
          className="card mt-xl bg-subtle"
          style={{ border: "1px dashed var(--border)" }}
        >
          <div className="card-header border-b-0 pb-sm">
            <h3 className="card-header__title" style={{ fontSize: "1.1rem" }}>
              Webhook Integrations
            </h3>
          </div>
          <div className="p-lg pt-0 flex-col gap-sm">
            <p className="text-secondary" style={{ fontSize: "0.95rem" }}>
              Automatically import transactions via Zapier or Make.com.
            </p>
            <div className="flex-row align-center gap-sm">
              <code
                className="bg-bg border px-md py-sm flex-1"
                style={{
                  borderRadius: "var(--radius-sm)",
                  fontFamily: "monospace",
                  color: "var(--text-primary)",
                }}
              >
                {window.location.origin}/api/imports/webhook
              </code>
              <button
                type="button"
                className="btn btn-outline btn-icon"
                onClick={handleCopyWebhookUrl}
                title="Copy URL"
              >
                <Copy size={16} />
              </button>
            </div>
            <p className="text-muted mt-xs" style={{ fontSize: "0.85rem" }}>
              Requires the Webhook Secret to be passed in the `x-webhook-secret`
              header.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
