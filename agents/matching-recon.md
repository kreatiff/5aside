# Recon & Matching Agents Instructions

This file documents the `packages/recon` logic to ensure future agents understand how the transaction-to-player matching algorithms and parsing operate.

## Overview
The `recon` package is pure TypeScript handling tasks like `normalizeName`, `matchPlayerByAlias`, `isChargeableStatus`, and `parseCsvLines`.
The most critical export is `matchPlayerByAlias(rawDescription, candidates)`, which matches incoming bank or Facebook inputs to registered players.

## Matching Algorithm Rules
The algorithm is structured by priority:
### 1. Spaceless Substring Match
- Strips non-alphanumeric characters from description and alias.
- Determines if the alias is a literal substring of the description.
- To prevent false positives, requires alias length >= 4 characters.
- If multiple candidates pass, **the longest alias wins.**
- Yields: `confidence: 1.0`, reason: `exact_substring_match`.

### 2. Token Intersection
- Splits strings on whitespace.
- Filters out irrelevant stop words (e.g., "payment", "from", "ref", "transfer", "osko", "internet", "credit").
- Tally how many alias tokens are found in the description.
- **Viability conditions:**
  - If a 1-word alias: matched token >= 4 chars.
  - If a multi-word alias: >= 2 matched tokens **OR** 1 token matching and it is >= 5 chars.
- Yields: `confidence: 0.85`, reason: `token_intersection_match`.

### 3. No Match
- If neither algorithm clears the threshold, the match fails (`matched: false`).
- However, the candidate with the highest overlap (even if non-viable) is returned as a `playerId`.
- This unconfident ID must be saved in `reconciliation_queue.suggested_player_id` to aid manual admin resolution.

## Candidate Inputs
Candidates passed into `matchPlayerByAlias` *must always* include:
1. Every player's active `display_name` (no explicit aliases are strictly required for a player to be matched).
2. All entries inside the `player_aliases` database table.

## Retroactive Matching Guidelines
When aliases are appended or altered in the API, the backend invokes one of two methods (found in `apps/api/src/services/bank-import.ts`):
- `rescanPendingTransactionsForPlayer(client, playerId)` -> rescans all open bank transaction queue items for a single target player.
- `rescanAllPendingTransactions(client)` -> performs the same operation universally.

## Handling Failures & Edge Cases
Failing matches typically require manually adding an alias via the UI/API. Known scenarios:
- Initials: "J Smith" → manually add "J Smith" as a literal alias.
- Nicknames: "Jonno" → add alias.
- Single surname: "Smith" → add "Smith" if and only if it won't conflict with another player's name in the league.
