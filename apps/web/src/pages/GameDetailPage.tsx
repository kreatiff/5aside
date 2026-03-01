import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Upload,
  Edit2,
  Lock,
  Save,
} from "lucide-react";

export const GameDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [isEditingFee, setIsEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [importText, setImportText] = useState("");

  const { data: game, isLoading } = useQuery({
    queryKey: ["games", id],
    queryFn: async () => {
      const { data } = await api.get(`/games/${id}`);
      return data;
    },
  });

  const updateGameMutation = useMutation({
    mutationFn: async (updates: { feeCents?: number; status?: string }) => {
      await api.patch(`/games/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      setIsEditingFee(false);
    },
  });

  const importAttendanceMutation = useMutation({
    mutationFn: async (text: string) => {
      await api.post(`/games/${id}/attendance/import`, { text });
    },
    onSuccess: () => {
      setImportText("");
      queryClient.invalidateQueries({ queryKey: ["games", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
      alert(
        "Import successful. Check Reconciliation Queue for mismatched names.",
      );
    },
  });

  const handleSaveFee = () => {
    const newFee = Number(feeInput);
    if (!isNaN(newFee)) {
      updateGameMutation.mutate({ feeCents: newFee });
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (importText.trim()) {
      importAttendanceMutation.mutate(importText);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  if (isLoading)
    return (
      <div className="page-header">
        <h1 className="page-title">Loading...</h1>
      </div>
    );
  if (!game)
    return (
      <div className="page-header">
        <h1 className="page-title">Game Not Found</h1>
      </div>
    );

  return (
    <>
      <div style={{ marginBottom: "var(--spacing-md)" }}>
        <Link
          to="/games"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
          }}
        >
          <ArrowLeft size={16} /> Back to Games
        </Link>
      </div>

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              color: "var(--primary)",
            }}
          >
            <CalendarIcon size={32} />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: "4px" }}>
              Game on {game.game_date}
            </h1>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "99px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  backgroundColor:
                    game.status === "completed"
                      ? "rgba(34, 197, 94, 0.1)"
                      : "rgba(59, 130, 246, 0.1)",
                  color:
                    game.status === "completed"
                      ? "var(--success)"
                      : "var(--primary)",
                  textTransform: "uppercase",
                }}
              >
                {game.status}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.875rem",
                  textTransform: "capitalize",
                }}
              >
                Source: {game.source}
              </span>
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            minWidth: "200px",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Match Fee
          </span>

          {isEditingFee ? (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                className="input-field"
                style={{ width: "100px", padding: "4px 8px" }}
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
              />
              <button
                className="btn btn-primary"
                style={{ padding: "6px" }}
                onClick={handleSaveFee}
              >
                <Save size={16} />
              </button>
              <button
                className="btn btn-outline"
                style={{ padding: "6px" }}
                onClick={() => setIsEditingFee(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {formatCurrency(game.fee_cents)}
              </span>
              {game.status === "completed" ? (
                <span title="Cannot edit completed game fee">
                  <Lock size={16} color="var(--text-muted)" />
                </span>
              ) : (
                <button
                  className="btn btn-outline"
                  style={{ padding: "4px" }}
                  onClick={() => {
                    setFeeInput(game.fee_cents.toString());
                    setIsEditingFee(true);
                  }}
                >
                  <Edit2 size={14} />
                </button>
              )}
            </div>
          )}

          {game.status !== "completed" && (
            <button
              className="btn btn-outline"
              style={{
                width: "100%",
                marginTop: "8px",
                color: "var(--success)",
                borderColor: "var(--success)",
              }}
              onClick={() => updateGameMutation.mutate({ status: "completed" })}
              disabled={updateGameMutation.isPending}
            >
              Finalize Game
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "var(--spacing-lg)",
        }}
      >
        <div className="card" style={{ alignSelf: "start" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--spacing-md)",
            }}
          >
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
              Attendance List ({game.attendance?.length || 0})
            </h3>
          </div>

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
                      padding: "8px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Player
                  </th>
                  <th
                    style={{
                      padding: "8px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Response
                  </th>
                  <th
                    style={{
                      padding: "8px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    Chargeable
                  </th>
                </tr>
              </thead>
              <tbody>
                {game.attendance?.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      No attendance records.
                    </td>
                  </tr>
                ) : (
                  game.attendance?.map((att: any) => (
                    <tr
                      key={att.id}
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <td style={{ padding: "12px 8px", fontWeight: 500 }}>
                        <Link
                          to={`/players/${att.player_id}`}
                          style={{ color: "var(--text-primary)" }}
                        >
                          {att.display_name}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: "12px 8px",
                          textTransform: "capitalize",
                        }}
                      >
                        {att.source_status}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <span
                          style={{
                            color: att.chargeable
                              ? "var(--warning)"
                              : "var(--text-muted)",
                          }}
                        >
                          {att.chargeable ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
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
            Import Facebook Poll
          </h3>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              marginBottom: "var(--spacing-md)",
            }}
          >
            Copy and paste the attendee list from the Facebook event poll. Our
            engine will map names automatically.
          </p>
          <form onSubmit={handleImportSubmit}>
            <textarea
              className="input-field"
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="e.g. 5 Going: John Doe, Jane Smith
3 Defaulted: Bobby Tables
2 Can't go: Foo Bar"
              style={{
                resize: "vertical",
                marginBottom: "var(--spacing-md)",
                fontFamily: "monospace",
              }}
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={importAttendanceMutation.isPending}
            >
              {importAttendanceMutation.isPending
                ? "Importing..."
                : "Process Import"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
