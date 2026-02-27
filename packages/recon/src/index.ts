export type MatchCandidate = {
  playerId: string;
  aliasNormalized: string;
};

export type MatchResult = {
  matched: boolean;
  playerId: string | null;
  confidence: number;
  reason: string;
};

const NON_WORD_REGEX = /[^a-z0-9]+/g;

export function normalizeName(raw: string): string {
  return raw.toLowerCase().trim().replace(NON_WORD_REGEX, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(input: string): Set<string> {
  return new Set(normalizeName(input).split(" ").filter(Boolean));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function matchPlayerByAlias(rawName: string, candidates: MatchCandidate[]): MatchResult {
  const normalized = normalizeName(rawName);
  const exact = candidates.find((candidate) => candidate.aliasNormalized === normalized);
  if (exact) {
    return { matched: true, playerId: exact.playerId, confidence: 1, reason: "exact_alias_match" };
  }

  const sourceTokens = tokenSet(rawName);
  let best: { playerId: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = jaccard(sourceTokens, tokenSet(candidate.aliasNormalized));
    if (!best || score > best.score) {
      best = { playerId: candidate.playerId, score };
    }
  }

  if (!best || best.score < 0.5) {
    return { matched: false, playerId: null, confidence: best?.score ?? 0, reason: "low_confidence" };
  }

  return {
    matched: true,
    playerId: best.playerId,
    confidence: Number(best.score.toFixed(2)),
    reason: "fuzzy_alias_match"
  };
}

export function isChargeableStatus(sourceStatus: string): boolean {
  return normalizeName(sourceStatus) === "going";
}

export function parseCsvLines(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((entry) => entry.trim()));
}
