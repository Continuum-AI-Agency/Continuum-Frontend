// The single source of truth for turning an ad-set row into a human name across
// the optimizer surface. Preference order:
//   1. row.adset_name — the name merged onto the wire by
//      optimizer_get_portfolio_performance (the B0 join). This is authoritative and
//      needs no side read.
//   2. nameById — the enrolled-roster map (optimizer_list_portfolio_adsets), a
//      fallback for rows that predate the join or arrive without a name.
//   3. null — no name is known; the caller renders the raw id through AdSetIdLabel
//      (the honest, debug-looking default) rather than inventing one.
//
// Kept pure and DOM-free so every table/chart adapter resolves the name the same
// way instead of re-deriving the precedence per component. Empty/whitespace-only
// names are treated as absent so a blank string never wins over a real fallback.

export function resolveAdsetName(
  row: { adset_id: string; adset_name?: string | null },
  nameById?: Map<string, string> | null,
): string | null {
  const onRow = row.adset_name?.trim();
  if (onRow) return onRow;

  const fromMap = nameById?.get(row.adset_id)?.trim();
  if (fromMap) return fromMap;

  return null;
}
