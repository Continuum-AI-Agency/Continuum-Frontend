// Stable identity for a recommendation insight, used as both the browser cache key
// and the durable DB key (optimizer.recommendation_insights.insight_key). Enrolled
// recs carry a DB id; client-side what-if recs do not, so they are keyed by an
// FNV-1a hash of their content. `reason` is part of the hash because two what-if
// recs of the same kind/trigger on the same ad set can carry different numbers as
// the operator changes mode/total — keeping reason in the key keeps the cache
// correct without a DB id.

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a is defined via XOR
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: unsigned 32-bit coercion for the hash digest
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function recommendationInsightKey(rec: {
  id?: string | null;
  adsetId: string;
  kind: string;
  trigger: string;
  reason: string;
}): string {
  if (rec.id) return rec.id;
  return `wi_${fnv1a(`${rec.adsetId}|${rec.kind}|${rec.trigger}|${rec.reason}`)}`;
}
