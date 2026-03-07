import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Upload, FileText, Copy, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable, type Column } from "../components/DataTable";
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

  const historyColumns: Column<ImportRecord>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date",
        sortable: true,
        sortValue: (imp) => new Date(imp.createdAt).getTime(),
        render: (imp) => formatDateTime(imp.createdAt),
      },
      {
        key: "source",
        header: "Source",
        render: (imp) => (
          <span className="text-primary">
            <strong>{imp.sourceType}</strong>
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (imp) => (
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
        ),
      },
      {
        key: "summary",
        header: "Summary",
        render: (imp) => (
          <span className="text-muted">
            {imp.recordCount} processed
            {imp.errorDetails ? `: ${imp.errorDetails}` : ""}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Bank Imports" />

      <div className="grid-2 gap-md">
        <div className="flex-col gap-md">
          <div className="card">
            <div className="card-header">
              <h3 className="card-header__title">
                <Upload size={20} className="text-primary" />
                Upload CSV Statement
              </h3>
            </div>

            {!previewRows ? (
              <>
                <p className="text-muted mb-md">
                  Upload a bank statement in CSV format. The system will show
                  you a preview, automatically detect duplicates, and let you
                  choose which transactions to import.
                </p>

                <form onSubmit={handlePreview}>
                  <div
                    className={`upload-zone ${dragOver ? "drag-over" : ""} ${file ? "upload-zone--selected" : ""}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      id="csv-upload"
                      onChange={handleFileChange}
                      hidden
                    />
                    <label htmlFor="csv-upload" className="upload-zone__label">
                      <div className="upload-zone__icon">
                        <FileText size={48} />
                      </div>
                      <span className="upload-zone__text">
                        {file ? file.name : "Click to select CSV file"}
                      </span>
                      <span className="upload-zone__hint">
                        or drag and drop here
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className={`btn btn-primary mt-md ${uploading ? "btn-loading" : ""}`}
                    disabled={!file || uploading}
                  >
                    {uploading ? "Analyzing..." : "Preview Import"}
                  </button>
                </form>
              </>
            ) : (
              <>
                {/* Preview summary */}
                <div className="mb-md">
                  <p className="text-secondary mb-sm">
                    <strong>{previewRows.length}</strong> transactions found in
                    CSV.
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
                        <strong>{discardedIds.size}</strong> manually excluded.
                      </span>
                    )}
                  </p>
                  <p className="text-success">
                    <strong>{importableRows.length}</strong> transaction
                    {importableRows.length !== 1 ? "s" : ""} will be imported.
                  </p>
                </div>

                {/* Preview table */}
                <div className="preview-table-wrapper">
                  <table className="batch-preview-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
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
                            style={{ opacity: isDiscarded ? 0.4 : 1 }}
                          >
                            <td>
                              {row.externalTxnId && (
                                <button
                                  className={`btn btn-ghost btn-sm ${isDiscarded ? "" : "btn-danger"}`}
                                  onClick={() =>
                                    toggleDiscard(row.externalTxnId!)
                                  }
                                  title={
                                    isDiscarded
                                      ? "Include this transaction"
                                      : "Exclude this transaction"
                                  }
                                  style={{ padding: "2px 4px" }}
                                >
                                  {isDiscarded ? (
                                    <span style={{ fontSize: "0.75rem" }}>
                                      ↩
                                    </span>
                                  ) : (
                                    <X size={14} />
                                  )}
                                </button>
                              )}
                            </td>
                            <td>{formatDate(row.postedAtUtc)}</td>
                            <td className="truncate" style={{ maxWidth: 300 }}>
                              {row.descriptionRaw}
                            </td>
                            <td style={{ textAlign: "right" }}>
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
                <div className="gap-sm mt-md" style={{ display: "flex" }}>
                  <button
                    className={`btn btn-primary ${importing ? "btn-loading" : ""}`}
                    onClick={handleConfirmImport}
                    disabled={importing || importableRows.length === 0}
                  >
                    {importing
                      ? "Importing..."
                      : `Import ${importableRows.length} Transaction${importableRows.length !== 1 ? "s" : ""}`}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={handleCancelPreview}
                    disabled={importing}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-header__title">Webhook Integrations</h3>
            </div>
            <p className="text-secondary mb-sm">
              You can automatically import transactions via Zapier or Make.com
              by sending a POST request to:
            </p>
            <div className="input-group mb-sm">
              <code className="input-group__code">
                {window.location.origin}/api/imports/webhook
              </code>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-icon"
                onClick={handleCopyWebhookUrl}
                title="Copy URL"
              >
                <Copy size={16} />
              </button>
            </div>
            <p className="form-hint">
              Requires the Webhook Secret to be passed in the `x-webhook-secret`
              header.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">Import History</h3>
          </div>

          <DataTable<ImportRecord>
            columns={historyColumns}
            data={imports}
            isLoading={isLoading}
            getRowId={(imp) => imp.id}
            emptyIcon={<FileText size={48} />}
            emptyTitle="No imports recorded"
            emptyDescription="Upload a bank CSV or configure a webhook to get started."
          />
        </div>
      </div>
    </>
  );
};
