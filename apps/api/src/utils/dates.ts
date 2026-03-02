/**
 * Generates an array of YYYY-MM-DD date strings starting from `startDate`,
 * incrementing by the given frequency, for `count` items.
 */
export function generateGameDates(
  startDate: string,
  frequency: "weekly" | "fortnightly" | "monthly",
  count: number
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00Z");

  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    switch (frequency) {
      case "weekly":
        d.setUTCDate(d.getUTCDate() + i * 7);
        break;
      case "fortnightly":
        d.setUTCDate(d.getUTCDate() + i * 14);
        break;
      case "monthly": {
        d.setUTCMonth(d.getUTCMonth() + i);
        // Clamp to last day of target month if original day overflows
        const targetMonth = (start.getUTCMonth() + i) % 12;
        if (d.getUTCMonth() !== targetMonth) {
          d.setUTCDate(0); // Go back to last day of previous month
        }
        break;
      }
    }
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
