import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Upload, FileText, CheckCircle, XCircle } from "lucide-react";

export const ImportsPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data } = await api.get(`/imports?limit=20`);
      return data;
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError("");
      setSuccess("");
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const text = await file.text();
      const { data } = await api.post("/imports/csv", { csvData: text });
      setSuccess(
        `Imported successfully. Processed ${data.processed} transactions.`,
      );
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to upload CSV");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Bank Imports</h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: "var(--spacing-lg)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-lg)",
          }}
        >
          <div className="card">
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "var(--spacing-md)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Upload size={20} color="var(--primary)" />
              Upload CSV Statement
            </h3>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                marginBottom: "var(--spacing-md)",
              }}
            >
              Upload a bank statement in CSV format. The system will
              automatically match payments to players where possible and queue
              the rest for reconciliation.
            </p>

            <form onSubmit={handleUpload}>
              <div
                style={{
                  border: "2px dashed var(--border-color)",
                  borderRadius: "8px",
                  padding: "24px",
                  textAlign: "center",
                  marginBottom: "var(--spacing-md)",
                  backgroundColor: "var(--bg-base)",
                }}
              >
                <input
                  type="file"
                  accept=".csv"
                  id="csv-upload"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <label
                  htmlFor="csv-upload"
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <FileText
                    size={48}
                    color={file ? "var(--primary)" : "var(--text-muted)"}
                  />
                  <span
                    style={{
                      fontWeight: 500,
                      color: file
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {file ? file.name : "Click to select CSV file"}
                  </span>
                </label>
              </div>

              {error && (
                <p
                  className="error-text"
                  style={{ marginBottom: "16px", fontSize: "0.875rem" }}
                >
                  {error}
                </p>
              )}
              {success && (
                <p
                  style={{
                    color: "var(--success)",
                    marginBottom: "16px",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                  }}
                >
                  {success}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={!file || uploading}
              >
                {uploading ? "Processing..." : "Upload & Analyze"}
              </button>
            </form>
          </div>

          <div className="card">
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "var(--spacing-md)",
              }}
            >
              Webhook Integrations
            </h3>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginBottom: "var(--spacing-sm)",
              }}
            >
              You can automatically import transactions via Zapier or Make.com
              by sending a POST request to:
            </p>
            <code
              style={{
                display: "block",
                padding: "12px",
                backgroundColor: "var(--bg-base)",
                borderRadius: "6px",
                fontSize: "0.75rem",
                wordBreak: "break-all",
                marginBottom: "var(--spacing-sm)",
                border: "1px solid var(--border-color)",
              }}
            >
              {window.location.origin}/api/imports/webhook
            </code>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Requires the Webhook Secret to be passed in the `x-webhook-secret`
              header.
            </p>
          </div>
        </div>

        <div className="card">
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              marginBottom: "var(--spacing-md)",
            }}
          >
            Import History
          </h3>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Source
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Summary
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: "16px", textAlign: "center" }}
                    >
                      Loading...
                    </td>
                  </tr>
                ) : data?.data?.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      No imports recorded.
                    </td>
                  </tr>
                ) : (
                  data?.data?.map((imp: any) => (
                    <tr
                      key={imp.id}
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <td style={{ padding: "16px", fontSize: "0.875rem" }}>
                        {new Date(imp.created_at).toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "16px",
                          textTransform: "capitalize",
                          fontWeight: 500,
                        }}
                      >
                        {imp.source}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {imp.status === "success" ? (
                            <CheckCircle size={16} color="var(--success)" />
                          ) : (
                            <XCircle size={16} color="var(--danger)" />
                          )}
                          <span
                            style={{
                              fontSize: "0.875rem",
                              color:
                                imp.status === "success"
                                  ? "var(--success)"
                                  : "var(--danger)",
                            }}
                          >
                            {imp.status}
                          </span>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "16px",
                          fontSize: "0.875rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {imp.records_processed} processed
                        {imp.error_details ? `: ${imp.error_details}` : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};
