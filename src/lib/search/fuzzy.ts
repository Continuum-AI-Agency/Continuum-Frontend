// Client-side fuzzy matching for lists small enough to hold in memory.
//
// Two passes, in order of confidence: a substring hit, then a subsequence hit so
// abbreviations work ("pdopt" finds "Paid Optimization"). Case and punctuation
// are stripped first, which is what makes "leg-press" match "Leg Press" and
// "vivo47" match "VIVO 47".
//
// This is a PREDICATE, not a ranker -- callers keep their own sort order (most
// lists here are already ordered by recency, which is a better default than a
// match score). When ranking is the point, use cmdk's Command: its
// command-score is the scorer, and src/components/ui/command.filter.test.tsx
// pins that behaviour.

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function fuzzyIncludes(value: string, query: string): boolean {
  if (value.includes(query)) {
    return true;
  }

  let queryIndex = 0;
  for (const char of value) {
    if (char === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }

  return false;
}

/** True when any field fuzzy-matches. An empty query matches everything. */
export function fuzzyMatches(
  fields: ReadonlyArray<string | null | undefined>,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  return fields.some(
    (field) =>
      Boolean(field) && fuzzyIncludes(normalizeSearchText(field as string), normalizedQuery),
  );
}
