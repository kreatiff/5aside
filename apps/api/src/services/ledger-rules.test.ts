import { describe, expect, it, vi, beforeEach } from "vitest";
import { processPaymentWithRules, applyRetroactiveSplit } from "./ledger-rules.js";
import { insertLedgerEntry } from "./ledger.js";

// Mock the ledger service
vi.mock("./ledger.js", () => ({
  insertLedgerEntry: vi.fn(),
}));

describe("processPaymentWithRules", () => {
  const mockClient = {
    query: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a single standard payment if no rule tags are present", async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT notes")) {
        return { rows: [{ notes: "Normal player notes", display_name: "Payer Name" }], rowCount: 1 };
      }
      if (sql.includes("SELECT current_game_fee_cents")) {
        return { rows: [{ current_game_fee_cents: 1000 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await processPaymentWithRules(mockClient, "payer-id", 1000, "txn-id");

    expect(result.split).toBe(false);
    expect(insertLedgerEntry).toHaveBeenCalledTimes(1);
    expect(insertLedgerEntry).toHaveBeenCalledWith(mockClient, expect.objectContaining({
      playerId: "payer-id",
      amountCents: -1000,
    }));
  });

  it("should split the payment if tag is present and amount is exactly 2x game fee", async () => {
    const beneficiaryId = "00000000-0000-0000-0000-000000000000";
    mockClient.query.mockImplementation(async (sql: string) => {
      // Payer query
      if (sql.includes("SELECT notes")) {
        return { 
          rows: [{ notes: `Note with [AUTO_PAY_FOR: ${beneficiaryId}] tag`, display_name: "Payer Name" }], 
          rowCount: 1 
        };
      }
      // Settings query
      if (sql.includes("SELECT current_game_fee_cents")) {
        return { rows: [{ current_game_fee_cents: 1000 }], rowCount: 1 };
      }
      // Beneficiary check query
      if (sql.includes("SELECT display_name FROM players WHERE id = $1")) {
        return { rows: [{ display_name: "Beneficiary Name" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await processPaymentWithRules(mockClient, "payer-id", 2000, "txn-id");

    expect(result.split).toBe(true);
    expect(result.beneficiaryId).toBe(beneficiaryId);
    expect(insertLedgerEntry).toHaveBeenCalledTimes(2);
    
    // Check payer entry
    expect(insertLedgerEntry).toHaveBeenCalledWith(mockClient, expect.objectContaining({
      playerId: "payer-id",
      amountCents: -1000,
      adjustmentReason: "Auto-split with Beneficiary Name"
    }));
    
    // Check beneficiary entry
    expect(insertLedgerEntry).toHaveBeenCalledWith(mockClient, expect.objectContaining({
      playerId: beneficiaryId,
      amountCents: -1000,
      adjustmentReason: "Auto-transfer from Payer Name"
    }));
  });

  it("should NOT split if amount is NOT 2x game fee, even with tag", async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT notes")) {
        return { rows: [{ notes: "[AUTO_PAY_FOR: beneficiary-id]", display_name: "Payer" }], rowCount: 1 };
      }
      if (sql.includes("SELECT current_game_fee_cents")) {
        return { rows: [{ current_game_fee_cents: 1000 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    // Pay only 1x fee
    const result = await processPaymentWithRules(mockClient, "payer-id", 1000, "txn-id");

    expect(result.split).toBe(false);
    expect(insertLedgerEntry).toHaveBeenCalledTimes(1);
    expect(insertLedgerEntry).toHaveBeenCalledWith(mockClient, expect.objectContaining({
      playerId: "payer-id",
      amountCents: -1000
    }));
  });
});

describe("applyRetroactiveSplit", () => {
  const mockClient = {
    query: vi.fn(),
  } as any;
  const mockRecalculate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should find and split matching old payments", async () => {
    const beneficiaryId = "00000000-0000-0000-0000-000000000000";
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT notes")) {
        return { rows: [{ notes: `[AUTO_PAY_FOR: ${beneficiaryId}]`, display_name: "Payer" }], rowCount: 1 };
      }
      if (sql.includes("SELECT current_game_fee_cents")) {
        return { rows: [{ current_game_fee_cents: 1000, cutoff_date: null }], rowCount: 1 };
      }
      if (sql.includes("SELECT display_name FROM players WHERE id = $1")) {
        return { rows: [{ display_name: "Beneficiary" }], rowCount: 1 };
      }
      if (sql.includes("SELECT id, amount_cents")) {
        return { 
          rows: [
            { id: "old-1", amount_cents: 2000, bank_transaction_id: "bt-1", created_at: "2024-01-01" },
            { id: "old-2", amount_cents: 2000, bank_transaction_id: "bt-2", created_at: "2024-01-02" }
          ], 
          rowCount: 2 
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await applyRetroactiveSplit(mockClient, "payer-id", mockRecalculate);

    expect(result.appliedCount).toBe(2);
    // 2 deletions
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM ledger_entries"), ["old-1"]);
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM ledger_entries"), ["old-2"]);
    
    // 4 new entries (2 for each split)
    expect(insertLedgerEntry).toHaveBeenCalledTimes(4);
    expect(mockRecalculate).toHaveBeenCalledTimes(1);
  });
});
