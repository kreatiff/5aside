export function snapshotFeeForGame(currentGlobalFeeCents: number): number {
  if (!Number.isInteger(currentGlobalFeeCents) || currentGlobalFeeCents <= 0) {
    throw new Error("Invalid global fee");
  }
  return currentGlobalFeeCents;
}

export function canEditGameFee(hasChargeLedgerEntries: boolean): boolean {
  return !hasChargeLedgerEntries;
}
