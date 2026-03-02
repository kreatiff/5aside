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
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../contexts/ToastContext";
import { formatCurrency } from "../utils/format";

type IntegrityIssue = {
  playerId: string;
  cachedBalance: number;
  calculatedBalance: number;
  difference: number;
};

export const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
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
      addToast("success", "Settings saved successfully");
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const dollars = Number(feeInput);
    if (!isNaN(dollars)) {
      updateSettingsMutation.mutate(Math.round(dollars * 100));
    }
  };

  const hasIssues = integrity?.issues?.length > 0;

  if (isLoading) {
    return (
      <PageHeader title="Settings" />
    );
  }

  return (
    <>
      <PageHeader title="Settings" />

      <div className="grid-2 gap-md">
        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">
              <Settings size={20} className="text-primary" />
              Application Configuration
            </h3>
          </div>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label" htmlFor="fee">
                Default Game Fee
              </label>
              <div className="input-group">
                <span className="input-group__prefix">$</span>
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
              </div>
              <p className="form-hint">
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
              className={`btn btn-primary ${updateSettingsMutation.isPending ? "btn-loading" : ""}`}
              disabled={updateSettingsMutation.isPending}
            >
              <Save size={16} />
              {updateSettingsMutation.isPending
                ? "Saving..."
                : "Save Settings"}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">
              <ShieldCheck size={20} className="text-success" />
              Admin Tools
            </h3>
          </div>

          <div
            className={`card card--bordered ${hasIssues ? "card--border-danger" : "card--border-success"}`}
          >
            <h4 className="mb-sm">
              <strong>Ledger Integrity Check</strong>
            </h4>
            <p className="text-secondary mb-md">
              Verifies that the sum of all ledger transactions exactly matches
              each player's cached `current_balance_cents`.
            </p>

            {loadingIntegrity ? (
              <p className="text-muted">Running check...</p>
            ) : !hasIssues ? (
              <div className="flex-between gap-sm">
                <StatusBadge variant="success" dot>
                  <Check size={14} /> Integrity Verified
                </StatusBadge>
                <span className="text-muted">All balances match</span>
              </div>
            ) : (
              <div>
                <div className="mb-sm">
                  <StatusBadge variant="danger" dot pulse>
                    <AlertTriangle size={14} /> Integrity Issues Detected
                  </StatusBadge>
                </div>
                <ul className="integrity-issues-list">
                  {integrity?.issues?.map(
                    (issue: IntegrityIssue, index: number) => (
                      <li key={index} className="text-danger">
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
