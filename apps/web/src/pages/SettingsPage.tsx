import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Settings,
  Save,
  AlertTriangle,
  ShieldCheck,
  Check,
} from "lucide-react";

export const SettingsPage = () => {
  const queryClient = useQueryClient();
  const [feeInput, setFeeInput] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await api.get("/settings");
      return data;
    },
  });

  const { data: integrity, isLoading: loadingIntegrity } = useQuery({
    queryKey: ["admin", "ledger-integrity"],
    queryFn: async () => {
      const { data } = await api.get("/admin/ledger-integrity");
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeeInput((settings.current_game_fee_cents / 100).toString());
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (feeCents: number) => {
      await api.patch("/settings", { currentGameFeeCents: feeCents });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      alert("Settings updated successfully.");
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const dollars = Number(feeInput);
    if (!isNaN(dollars)) {
      updateSettingsMutation.mutate(Math.round(dollars * 100));
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

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings & Admin</h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
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
            <Settings size={20} color="var(--primary)" />
            Application Configuration
          </h3>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label" htmlFor="fee">
                Default Game Fee ($)
              </label>
              <input
                id="fee"
                type="number"
                step="0.01"
                min="0"
                className="input-field"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                required
              />
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  marginTop: "8px",
                }}
              >
                This fee applies to all newly created games. It does not affect
                past games.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Application Timezone</label>
              <input
                type="text"
                className="input-field"
                value={settings?.app_timezone || "Europe/London"}
                disabled
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={updateSettingsMutation.isPending}
            >
              <Save size={16} />{" "}
              {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
            </button>
          </form>
        </div>

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
            <ShieldCheck size={20} color="var(--success)" />
            Admin Tools
          </h3>

          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--bg-base)",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
            }}
          >
            <h4 style={{ fontWeight: 600, marginBottom: "8px" }}>
              Ledger Integrity Check
            </h4>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginBottom: "16px",
              }}
            >
              Verifies that the sum of all ledger transactions exactly matches
              each player's cached `current_balance_cents`.
            </p>

            {loadingIntegrity ? (
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Running check...
              </p>
            ) : integrity?.issues?.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "var(--success)",
                  fontWeight: 500,
                }}
              >
                <Check size={20} /> Integrity Verified (All balances match)
              </div>
            ) : (
              <div style={{ color: "var(--danger)" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 600,
                    marginBottom: "8px",
                  }}
                >
                  <AlertTriangle size={20} /> Integrity Issues Detected
                </div>
                <ul style={{ fontSize: "0.875rem", paddingLeft: "24px" }}>
                  {integrity?.issues?.map(
                    (
                      issue: {
                        playerId: string;
                        cachedBalance: number;
                        calculatedBalance: number;
                        difference: number;
                      },
                      index: number,
                    ) => (
                      <li key={index}>
                        Player {issue.playerId}: Cached{" "}
                        {formatCurrency(issue.cachedBalance)}, Calculated{" "}
                        {formatCurrency(issue.calculatedBalance)} (Diff:{" "}
                        {formatCurrency(issue.difference)})
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
