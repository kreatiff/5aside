import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Calendar, DollarSign, User, FileText } from "lucide-react";
import { formatCurrency } from "../utils/format";

type Player = {
  id: string;
  displayName: string;
  currentBalanceCents: number;
};

export const ManualAdjustmentForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const isAdjustmentOpen = searchParams.get("adjustment") === "true";
  const defaultPlayerId = searchParams.get("playerId") || "";
  const isLocked = searchParams.get("locked") === "true";

  const [paymentType, setPaymentType] = useState<"player" | "game_fee" | "equipment">("player");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("incoming");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [playerId, setPlayerId] = useState(defaultPlayerId);
  const [description, setDescription] = useState("");

  const { data: playersData } = useQuery({
    queryKey: ["players", "all"],
    queryFn: async () => {
      const { data } = await api.get<{ data: Player[] }>("/players?limit=10000");
      return data;
    },
    enabled: isAdjustmentOpen,
  });

  useEffect(() => {
    if (defaultPlayerId) {
      setPlayerId(defaultPlayerId);
    }
  }, [defaultPlayerId]);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      return api.post("/transactions/manual", payload);
    },
    onSuccess: () => {
      addToast("success", "Adjustment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      onSuccess();
    },
    onError: (error: any) => {
      addToast("error", error.message || "Failed to record adjustment");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      addToast("error", "Please enter a valid amount");
      return;
    }

    if (paymentType === "player" && !playerId) {
      addToast("error", "Please select a player");
      return;
    }

    mutation.mutate({
      paymentType,
      direction,
      amountCents,
      date,
      playerId: paymentType === "player" ? playerId : undefined,
      description,
    });
  };

  if (!isAdjustmentOpen) return null;

  return (
    <form onSubmit={handleSubmit} className="flex-col gap-lg">
      <div className="form-group">
        <label className="form-label">Payment Type</label>
        <div className="select-wrapper">
          <select
            className="input-field"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as any)}
            disabled={isLocked}
          >
            <option value="player">Player Payment / Refund</option>
            <option value="game_fee">Venue Game Fee</option>
            <option value="equipment">Equipment / Other Expense</option>
          </select>
        </div>
      </div>

      <div className="form-row grid-2 gap-md">
        <div className="form-group">
          <label className="form-label">Direction</label>
          <div className="select-wrapper">
            <select
              className="input-field"
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
            >
              <option value="incoming">Incoming (to us)</option>
              <option value="outgoing">Outgoing (from us)</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Date</label>
          <div className="input-with-icon">
            <Calendar size={16} className="icon" />
            <input
              type="date"
              className="input-field pl-xl"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      {paymentType === "player" && (
        <div className="form-group">
          <label className="form-label">Player</label>
          <div className="select-wrapper">
            <User size={16} className="icon-left" />
            <select
              className="input-field pl-xl"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              disabled={isLocked}
              required={paymentType === "player"}
            >
              <option value="">Select a player...</option>
              {playersData?.data.map((p) => (
                <option 
                  key={p.id} 
                  value={p.id}
                  style={{ color: p.currentBalanceCents > 0 ? 'var(--danger)' : 'var(--success)' }}
                >
                  {p.displayName} ({formatCurrency(p.currentBalanceCents)})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Amount ($)</label>
        <div className="input-with-icon">
          <DollarSign size={16} className="icon" />
          <input
            type="number"
            step="0.01"
            className="input-field pl-xl"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Description (Optional)</label>
        <div className="input-with-icon">
          <FileText size={16} className="icon" style={{ top: '12px', transform: 'none' }} />
          <textarea
            className="input-field pl-xl py-sm"
            style={{ minHeight: '80px', resize: 'vertical' }}
            placeholder="e.g. Cash payment, Boots purchase, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-col gap-sm pt-md">
        <button
          type="submit"
          className="btn btn-primary w-full py-md"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Recording..." : "Record Transaction"}
        </button>
      </div>

      <style>{`
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; }
        @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
        .pl-xl { padding-left: 2.5rem !important; }
        .py-sm { padding-top: 0.5rem; padding-bottom: 0.5rem; }
        .input-with-icon { position: relative; display: flex; align-items: center; }
        .input-with-icon .icon { position: absolute; left: 1rem; color: var(--text-secondary); pointer-events: none; }
        .icon-left { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); pointer-events: none; z-index: 1; }
        .select-wrapper { position: relative; }
        .select-icon { position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-secondary); }
        .w-full { width: 100%; }
        .pt-md { padding-top: var(--spacing-md); }
      `}</style>
    </form>
  );
};
