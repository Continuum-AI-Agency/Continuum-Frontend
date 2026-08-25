// The first column of every row of a pasted CSV, as batch items.
//
// Hand-rolled on purpose: a correct quoted-cell scanner is the twenty lines below, and
// a CSV dependency for one paste box is not worth the install. `String.split(',')` is
// the wrong answer — it breaks on the first quoted cell containing a comma, which is
// exactly what a spreadsheet export of ad copy looks like.

import { MAX_BATCH_ITEMS } from '@continuum/contracts';

export interface CsvFirstColumnResult {
  readonly values: string[];
  /** True when the cap cut the paste short. Reported, never silent. */
  readonly truncated: boolean;
}

/**
 * Reads cell 1 of every row. No header detection: row 1's first cell is item 1, because
 * guessing "that looked like a header" wrong silently deletes a real item.
 *
 * Unquoted cells are trimmed; quoted cells are kept verbatim, so a value whose leading
 * space matters survives by being quoted. Empty cells and blank lines are skipped — an
 * empty item is a run that generates nothing.
 */
export function csvFirstColumn(input: string, cap: number = MAX_BATCH_ITEMS): CsvFirstColumnResult {
  const values: string[] = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;
  // True once this row's first column has been closed by a comma: everything after it
  // on the same row is a column we do not read.
  let columnDone = false;

  const endRow = (): void => {
    if (!columnDone) {
      const value = wasQuoted ? cell : cell.trim();
      if (value !== '') values.push(value);
    }
    cell = '';
    quoted = false;
    wasQuoted = false;
    columnDone = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      // A doubled quote inside a quoted cell is one literal quote, not the end of it.
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === '' && !columnDone) {
      quoted = true;
      wasQuoted = true;
      continue;
    }

    if (char === ',') {
      if (!columnDone) {
        const value = wasQuoted ? cell : cell.trim();
        if (value !== '') values.push(value);
        columnDone = true;
      }
      continue;
    }

    if (char === '\n' || char === '\r') {
      // CRLF is one break, not two: treating it as two would push a blank row between
      // every real one.
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      endRow();
      continue;
    }

    if (!columnDone) cell += char;
  }

  // A file with no trailing newline still has a last row.
  endRow();

  return { values: values.slice(0, cap), truncated: values.length > cap };
}
