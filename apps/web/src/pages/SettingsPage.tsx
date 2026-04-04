import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Settings,
  Save,
  AlertTriangle,
  ShieldCheck,
  Check,
  Calendar,
  X,
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
  const [venueFeeInput, setVenueFeeInput] = useState("");
  const [cutoffInput, setCutoffInput] = useState("");

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
      const s = settings.settings ?? settings;
      requestAnimationFrame(() => {
        setFeeInput(
          ((s.currentGameFeeCents ?? s.current_game_fee_cents ?? 0) / 100).toString(),
        );
        setVenueFeeInput(
          ((s.venueGameFeeCents ?? s.venue_game_fee_cents ?? 0) / 100).toString(),
        );
        setCutoffInput(s.cutoffDate ?? s.cutoff_date ?? "");
      });
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

  const updateVenueFeeMutation = useMutation({
    mutationFn: async (feeCents: number) => {
      await api.patch("/settings/venue-game-fee", { newFeeCents: feeCents });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      addToast("success", "Venue game fee updated");
    },
  });

  const updateCutoffMutation = useMutation({
    mutationFn: async (cutoffDate: string | null) => {
      await api.patch("/settings/cutoff-date", { cutoffDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      addToast("success", "Cutoff date updated. All balances have been recalculated.");
    },
    onError: () => {
      addToast("error", "Failed to update cutoff date");
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const dollars = Number(feeInput);
    if (!isNaN(dollars)) {
      updateSettingsMutation.mutate(Math.round(dollars * 100));
    }
  };

  const handleSaveVenueFee = (e: React.FormEvent) => {
    e.preventDefault();
    const dollars = Number(venueFeeInput);
    if (!isNaN(dollars) && dollars > 0) {
      updateVenueFeeMutation.mutate(Math.round(dollars * 100));
    }
  };

  const handleCutoffApply = () => {
    updateCutoffMutation.mutate(cutoffInput || null);
  };

  const handleCutoffClear = () => {
    setCutoffInput("");
    updateCutoffMutation.mutate(null);
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
              <Settings size={20} className="text-primary" />
              Venue Game Fee
            </h3>
          </div>

          <form onSubmit={handleSaveVenueFee}>
            <div className="form-group">
              <label className="form-label" htmlFor="venueFee">
                Default Venue Game Fee
              </label>
              <div className="input-group">
                <span className="input-group__prefix">$</span>
                <input
                  id="venueFee"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field"
                  value={venueFeeInput}
                  onChange={(e) => setVenueFeeInput(e.target.value)}
                  required
                />
              </div>
              <p className="form-hint">
                The weekly venue rental cost. Applied to newly created games. Does not affect past games.
              </p>
            </div>

            <button
              type="submit"
              className={`btn btn-primary ${updateVenueFeeMutation.isPending ? "btn-loading" : ""}`}
              disabled={updateVenueFeeMutation.isPending}
            >
              <Save size={16} />
              {updateVenueFeeMutation.isPending ? "Saving..." : "Save Venue Fee"}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-header__title">
              <Calendar size={20} className="text-primary" />
              Balance Cutoff Date
            </h3>
          </div>

          <p className="text-secondary mb-md">
            Games and payments before this date will be excluded from all
            balance calculations and dashboard totals. Data remains in the
            database but is not counted. Leave empty to include all history.
          </p>

          <div className="form-group">
            <label className="form-label" htmlFor="cutoff">
              Cutoff Date
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                id="cutoff"
                type="date"
                className="input-field"
                value={cutoffInput}
                onChange={(e) => setCutoffInput(e.target.value)}
              />
              {cutoffInput && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleCutoffClear}
                  disabled={updateCutoffMutation.isPending}
                  title="Clear cutoff date"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            className={`btn btn-primary ${updateCutoffMutation.isPending ? "btn-loading" : ""}`}
            disabled={updateCutoffMutation.isPending}
            onClick={handleCutoffApply}
          >
            <Save size={16} />
            {updateCutoffMutation.isPending
              ? "Recalculating..."
              : "Apply Cutoff"}
          </button>
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
