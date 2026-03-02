import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Upload, FileText, Copy } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable, type Column } from "../components/DataTable";
import { useToast } from "../contexts/ToastContext";
import { formatDateTime } from "../utils/format";

type ImportRecord = {
  id: string;
  createdAt: string;
  sourceType: string;
  status: string;
  recordCount: number;
  errorDetails?: string;
};

export const ImportsPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setFile(dropped);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);

    try {
      const text = await file.text();
      const { data } = await api.post("/imports/bank-csv", { csv: text });
      addToast(
        "success",
        `Imported successfully. Processed ${data.posted + data.queued} transactions (${data.posted} posted, ${data.queued} queued for reconciliation).`,
      );
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast("error", e.response?.data?.error || "Failed to upload CSV");
    } finally {
      setUploading(false);
    }
  };

  const handleCopyWebhookUrl = useCallback(() => {
    const url = `${window.location.origin}/api/imports/webhook`;
    navigator.clipboard.writeText(url).then(() => {
      addToast("success", "Webhook URL copied to clipboard");
    });
  }, [addToast]);

  const imports: ImportRecord[] = useMemo(() => data?.data ?? [], [data]);

  const columns: Column<ImportRecord>[] = useMemo(
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
            variant={imp.status === "success" ? "success" : "danger"}
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
            <p className="text-muted mb-md">
              Upload a bank statement in CSV format. The system will
              automatically match payments to players where possible and queue
              the rest for reconciliation.
            </p>

            <form onSubmit={handleUpload}>
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
                {uploading ? "Processing..." : "Upload & Analyze"}
              </button>
            </form>
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
              Requires the Webhook Secret to be passed in the
              `x-webhook-secret` header.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">Import History</h3>
          </div>

          <DataTable<ImportRecord>
            columns={columns}
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
