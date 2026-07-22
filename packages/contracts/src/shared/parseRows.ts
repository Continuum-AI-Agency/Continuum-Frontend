// Row-wise parsing for RPC result sets.
//
// Call sites used to write `z.array(rowSchema).catch([]).parse(data)`. That puts
// the fallback on the ARRAY, so a single unrecognised row discards the entire
// result set — the caller sees an empty list and renders "no data" rather than an
// error. The failure that motivated this: an RPC began emitting a `dimension`
// value the deployed contract enum did not know yet, and the whole win-rate table
// silently went blank while every status field reported success.
//
// Parsing row-by-row bounds the blast radius to the offending row, and returning
// `dropped` keeps the loss observable — a silent partial read is how the original
// bug hid for as long as it did.

import type { z } from 'zod';

export type ParsedRows<T> = {
  rows: T[];
  /** How many entries failed validation and were skipped. */
  dropped: number;
};

export function parseRows<Schema extends z.ZodTypeAny>(
  schema: Schema,
  data: unknown,
): ParsedRows<z.infer<Schema>> {
  if (!Array.isArray(data)) return { rows: [], dropped: 0 };

  const rows: z.infer<Schema>[] = [];
  let dropped = 0;

  for (const entry of data) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) rows.push(parsed.data);
    else dropped += 1;
  }

  return { rows, dropped };
}
