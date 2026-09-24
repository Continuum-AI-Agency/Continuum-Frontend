'use client';

import type { TemplateFontCandidatesResponse } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The way out of a template stalled on a face nobody uploaded.
//
// Same shape as MappingQuestions, deliberately: a ranked Select per unanswered thing, an
// explicit way to answer nothing, and one apply. Not the same component — its props are typed
// to a forge need, and generalising that to cover fonts would cost more than this file.
//
// The rule it will not bend on is the pre-selection: only a same-typeface, same-cut match, and
// only when nothing ties it. The Backend decides that (`confidentFontCandidate`) and sends it as
// `suggested`; this file never promotes a candidate on its own. A face chosen silently is the
// 2026-09-15 failure, and it cost 12 GiB of masters in the wrong typeface.

const UNRESOLVED = '__unresolved';

export interface FontSubstitutionChoice {
  requestedFamily: string;
  fontId: string | null;
}

export function FontSubstitutions({
  candidates,
  busy,
  onUpload,
  onApply,
}: {
  candidates: TemplateFontCandidatesResponse;
  busy: boolean;
  onUpload: () => void;
  onApply: (choices: FontSubstitutionChoice[]) => Promise<void>;
}) {
  const rows = candidates.missing;
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.flatMap((row) => {
        // A standing decision shows as itself; otherwise the confident suggestion, if there is one.
        const start = row.aliasedTo ?? row.suggested;
        return start ? [[row.family, start]] : [];
      }),
    ),
  );

  if (rows.length === 0) return null;

  // Only what would actually change. Re-confirming a decision already recorded is a no-op the
  // person should not have to watch happen.
  const changed = rows.filter(
    (row) => (choices[row.family] ?? UNRESOLVED) !== (row.aliasedTo ?? UNRESOLVED),
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/5 p-2">
      <p className="text-muted-foreground">
        Pick a face you already hold for each one missing, or add the real file. A substituted face
        is what the render will install — the template card says so, and you can change it later.
      </p>
      <ul className="flex flex-col gap-1.5" aria-label="Missing typefaces">
        {rows.map((row) => (
          <li key={row.family} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{row.family}</span>
              {row.candidates.length === 0 ? (
                <span className="block text-2xs text-muted-foreground">
                  Nothing we hold resembles it — this one needs the file.
                </span>
              ) : null}
            </span>
            <Select
              disabled={busy || row.candidates.length === 0}
              value={choices[row.family] ?? UNRESOLVED}
              onValueChange={(value) =>
                value && setChoices((current) => ({ ...current, [row.family]: String(value) }))
              }
            >
              <SelectTrigger
                size="sm"
                className="w-64"
                aria-label={`Face to use for ${row.family}`}
              >
                <SelectValue placeholder="Leave unresolved">
                  {(value: string) => {
                    if (value === UNRESOLVED) return 'Leave unresolved';
                    const hit = row.candidates.find((option) => option.fontId === value);
                    return hit ? `${hit.family} · ${hit.why}` : 'Leave unresolved';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {row.candidates.map((option) => (
                  <SelectItem key={option.fontId} value={option.fontId}>
                    {option.family} · {option.why}
                  </SelectItem>
                ))}
                <SelectItem value={UNRESOLVED}>Leave unresolved</SelectItem>
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="xs"
          disabled={busy || changed.length === 0}
          onClick={() =>
            void onApply(
              changed.map((row) => ({
                requestedFamily: row.family,
                fontId: choices[row.family] === UNRESOLVED ? null : (choices[row.family] ?? null),
              })),
            )
          }
        >
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          Use these fonts
        </Button>
        <Button type="button" size="xs" variant="outline" disabled={busy} onClick={onUpload}>
          Add the real files
        </Button>
        <span className="text-muted-foreground">
          {changed.length === 0
            ? 'Nothing to change.'
            : `${changed.length} ${changed.length === 1 ? 'face' : 'faces'} will change.`}
        </span>
      </div>
    </div>
  );
}
