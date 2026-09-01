/**
 * Case-insensitive de-duplication of a club's location history, most-recent
 * first — first-seen (i.e. most recent) casing wins, order is preserved,
 * blanks are dropped, and the result is capped at `limit`.
 *
 * Extracted verbatim from the loop inside `useRecentLocations` in
 * `lib/hooks.ts` so it can be tested without a database.
 */
export function dedupeLocations(rawLocations: (string | null | undefined)[], limit: number): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of rawLocations) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(value);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
