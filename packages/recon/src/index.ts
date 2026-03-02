export type MatchCandidate = {
  playerId: string;
  aliasRaw: string;
};

export type MatchResult =
  | { matched: true; playerId: string; confidence: number; reason: string }
  | { matched: false; playerId: string | null; confidence: number; reason: string };

const NON_WORD_REGEX = /[^a-z0-9]+/g;

export function normalizeName(raw: string): string {
  return raw.toLowerCase().trim().replace(NON_WORD_REGEX, " ").replace(/\s+/g, " ").trim();
}

function splitIntoWords(input: string): string[] {
  return input.toLowerCase().replace(NON_WORD_REGEX, " ").split(" ").filter(w => w.length > 0);
}

// Noise words commonly seen in bank descriptions
const STOP_WORDS = new Set([
  "osko", "from", "ref", "no", "payment", "transfer", "to", "via",
  "internet", "credit", "debit", "receipt", "reference", "date", "effective", "for", "the"
]);

export function matchPlayerByAlias(rawName: string, candidates: MatchCandidate[]): MatchResult {
  const txnWords = splitIntoWords(rawName).filter(w => !STOP_WORDS.has(w));
  const txnWordSet = new Set(txnWords);
  const spacelessTxn = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");

  let bestMatch: {
    playerId: string;
    matchCount: number;
    aliasWordCount: number;
    isExact: boolean;
    aliasLength: number;
  } | null = null;

  // Tracks the highest token-scoring candidate even if it doesn't pass viability rules.
  // Used to populate suggested_player_id in the reconciliation queue for admin hints.
  let fallback: { playerId: string; score: number } | null = null;

  for (const candidate of candidates) {
    const normalizedAlias = candidate.aliasRaw.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Spaceless substring match — prefer the longest (most specific) matching alias.
    //    "johnsmith" (9 chars) beats "smith" (5 chars) when both are substrings.
    if (spacelessTxn.includes(normalizedAlias) && normalizedAlias.length >= 4) {
      if (!bestMatch || !bestMatch.isExact || normalizedAlias.length > bestMatch.aliasLength) {
        bestMatch = {
          playerId: candidate.playerId,
          matchCount: 999,
          aliasWordCount: 1,
          isExact: true,
          aliasLength: normalizedAlias.length
        };
      }
      continue;
    }

    // 2. Token intersection with stop-word filtering
    const aliasWords = splitIntoWords(candidate.aliasRaw).filter(w => !STOP_WORDS.has(w));
    if (aliasWords.length === 0) continue;

    let matchCount = 0;
    for (const w of aliasWords) {
      if (txnWordSet.has(w)) {
        matchCount++;
      }
    }

    // Track as a fallback suggestion even if below viability threshold
    if (matchCount > 0 && (!fallback || matchCount > fallback.score)) {
      fallback = { playerId: candidate.playerId, score: matchCount };
    }

    let isViable = false;
    if (aliasWords.length === 1) {
      // Single word must match exactly and be >= 4 chars to avoid false positives ("an", "mr")
      if (matchCount === 1 && (aliasWords[0]?.length ?? 0) >= 4) isViable = true;
    } else {
      // Multi-word aliases must share at least 2 significant words,
      // OR at least 1 significant word that is long enough (>= 5 chars) to be highly specific.
      if (matchCount >= 2) {
        isViable = true;
      } else if (matchCount === 1) {
        const matchedWord = aliasWords.find(w => txnWordSet.has(w));
        if (matchedWord && matchedWord.length >= 5) {
          isViable = true;
        }
      }
    }

    if (isViable) {
      if (!bestMatch || (matchCount > bestMatch.matchCount && !bestMatch.isExact)) {
        bestMatch = {
          playerId: candidate.playerId,
          matchCount,
          aliasWordCount: aliasWords.length,
          isExact: false,
          aliasLength: normalizedAlias.length
        };
      } else if (bestMatch && matchCount === bestMatch.matchCount && !bestMatch.isExact) {
        // Tie-breaker: higher percentage of matching words (less filler in the alias)
        const currentRatio = matchCount / aliasWords.length;
        const bestRatio = bestMatch.matchCount / bestMatch.aliasWordCount;
        if (currentRatio > bestRatio) {
          bestMatch = {
            playerId: candidate.playerId,
            matchCount,
            aliasWordCount: aliasWords.length,
            isExact: false,
            aliasLength: normalizedAlias.length
          };
        }
      }
    }
  }

  if (bestMatch) {
    return {
      matched: true,
      playerId: bestMatch.playerId,
      confidence: bestMatch.isExact ? 1 : 0.85,
      reason: bestMatch.isExact ? "exact_substring_match" : "token_intersection_match"
    };
  }

  // No viable match — return best partial candidate as a hint for manual reconciliation
  return { matched: false, playerId: fallback?.playerId ?? null, confidence: 0, reason: "no_match" };
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
