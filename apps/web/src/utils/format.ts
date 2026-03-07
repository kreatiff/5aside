export function formatCurrency(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const formatted = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(dollars);
  return cents < 0 ? `-${formatted}` : formatted;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const dateOnly = dateStr.split(/[T ]/)[0];
    const [year, month, day] = dateOnly.split("-").map(Number);
    const dd = String(day).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    return `${dd}/${mm}/${year}`;
  } catch (e) {
    return "";
  }
}

/** Parse any date string (YYYY-MM-DD, ISO, or Postgres timestamptz) into a timestamp for sorting */
export function parseDateToTimestamp(dateStr: string): number {
  if (!dateStr) return 0;
  const dateOnly = dateStr.split(/[T ]/)[0];
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "linear-gradient(135deg, #14b8a6, #0d9488)",
  "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  "linear-gradient(135deg, #06b6d4, #0891b2)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #22c55e, #16a34a)",
  "linear-gradient(135deg, #ec4899, #db2777)",
  "linear-gradient(135deg, #f97316, #ea580c)",
  "linear-gradient(135deg, #6366f1, #4f46e5)",
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
