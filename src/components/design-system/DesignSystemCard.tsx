'use client';

// The design-system card: upload, progress, and what we read.
//
// One component serves onboarding and settings because it is the same object at two
// moments, and a second implementation would drift the moment either one changed.
// `variant` only adjusts framing copy — the affordances are identical, deliberately,
// so a brand that skipped this during onboarding finds exactly the control it skipped.

import type { DesignSystemSnapshot } from '@continuum/contracts';
import { AlertTriangle, CheckCircle2, FileUp, FolderUp, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { uploadDesignSystem } from '@/lib/brands/designSystem.client';
import { cn } from '@/lib/utils';
import { useDesignSystem } from './useDesignSystem';

const STEP_LABELS: Record<string, string> = {
  uploading: 'Uploading',
  unpacking: 'Unpacking the archive',
  parsing: 'Reading tokens and cards',
  extracting: 'Extracting the written rules',
  reconciling: 'Reconciling with what we already knew',
  embedding: 'Making it searchable',
  ready: 'Ready',
};

const TIER_COPY: Record<string, { label: string; hint: string }> = {
  strict: {
    label: 'Strict',
    hint: 'Generations must comply. Violations are rejected.',
  },
  guided: {
    label: 'Guided',
    hint: 'Shapes every generation. A brief can override it.',
  },
  loose: {
    label: 'Loose',
    hint: 'Used as direction rather than as a rule.',
  },
};

export interface DesignSystemCardProps {
  brandId: string;
  variant?: 'onboarding' | 'settings';
  /** Told whether the card is mid-import, so onboarding can hold its Continue. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

export function DesignSystemCard({
  brandId,
  variant = 'settings',
  onBusyChange,
  className,
}: DesignSystemCardProps) {
  const state = useDesignSystem(brandId);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const busy = state.phase === 'parsing' || uploadStage !== null;

  // Derived, not announced from the handler. Announcing it imperatively means every
  // exit from the upload has to remember to say so, and the success exit did not —
  // which left onboarding's Continue disabled under "Reading design system…" forever.
  // `busy` is already the whole truth, and Realtime moving the row to `ready` releases
  // it without this component being told.
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploadError(null);
      try {
        await uploadDesignSystem({
          brandId,
          files: Array.from(fileList),
          onProgress: (stage) => setUploadStage(stage),
        });
        await state.refresh();
      } catch (error) {
        setUploadError((error as Error).message);
      } finally {
        setUploadStage(null);
      }
    },
    [brandId, state],
  );

  const snapshot = state.snapshot;

  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card/50 p-5',
        busy && 'border-primary/40',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-primary">Design system</h3>
          <p className="mt-1 max-w-prose text-sm text-secondary">
            {variant === 'onboarding'
              ? 'If your brand has an approved design system, add it now. It is the strongest signal we have about how your work should look, and everything we generate afterwards follows it.'
              : 'Your approved visual system. Everything Continuum generates follows the tokens and rules below.'}
          </p>
        </div>
        {snapshot ? <RigorBadge snapshot={snapshot} /> : null}
      </header>

      {state.phase === 'parsing' || uploadStage ? (
        <ProgressRow
          label={
            uploadStage === 'packaging'
              ? 'Packaging your files'
              : uploadStage === 'uploading'
                ? 'Uploading'
                : (STEP_LABELS[state.progressStep ?? ''] ?? 'Working')
          }
          percent={uploadStage ? 5 : state.progressPercent}
        />
      ) : null}

      {state.phase === 'error' || uploadError ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-primary">{uploadError ?? state.errorMessage}</p>
        </div>
      ) : null}

      {snapshot ? <SystemSummary snapshot={snapshot} /> : null}

      {!busy ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
            <FolderUp className="size-4" aria-hidden />
            {snapshot ? 'Replace from folder' : 'Upload a folder'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="size-4" aria-hidden />
            {snapshot ? 'Replace from file' : 'Upload a file'}
          </Button>
          <span className="text-xs text-secondary">
            A design-system export, a token JSON, a zip, or a brand guideline PDF.
          </span>
        </div>
      ) : null}

      {/* `webkitdirectory` is what preserves the folder structure; without it the
          manifest's own card paths cannot be matched to the files they name. */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        // @ts-expect-error — non-standard but universally supported, and the only way
        // to accept a directory. React has no typing for it.
        webkitdirectory=""
        directory=""
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json,.pdf,.docx,.pptx"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
    </section>
  );
}

function RigorBadge({ snapshot }: { snapshot: DesignSystemSnapshot }) {
  const tier = snapshot.rigor.override ?? snapshot.rigor.tier;
  const copy = TIER_COPY[tier] ?? TIER_COPY.loose;
  return (
    <div className="text-right">
      <Badge variant={tier === 'strict' ? 'default' : 'secondary'}>{copy.label}</Badge>
      <p className="mt-1 max-w-[16rem] text-xs text-secondary">{copy.hint}</p>
    </div>
  );
}

function ProgressRow({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 text-sm text-primary">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        <span>{label}…</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * What we actually read, stated plainly.
 *
 * This is the part that earns trust: a brand that hands over its system wants to know
 * we understood it, and "86 tokens · Poppins · 12 sections" is a far better answer than
 * a success tick. The unresolved-conflict line is deliberately prominent — it is the
 * one thing here that asks for a decision.
 */
function SystemSummary({ snapshot }: { snapshot: DesignSystemSnapshot }) {
  const swatches = snapshot.tokens
    .filter((token) => token.kind === 'color' && token.resolvedValue?.startsWith('#'))
    .slice(0, 10);
  const unresolved = snapshot.conflicts.filter((conflict) => conflict.acknowledgedAt === null);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 text-sm text-primary">
        <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
        <span>
          {snapshot.tokens.length} tokens · {snapshot.sections.length} sections
          {snapshot.fonts.length > 0
            ? ` · ${snapshot.fonts.map((font) => font.family).join(', ')}`
            : ''}
        </span>
      </div>

      {swatches.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((token) => (
            <span
              key={token.name}
              className="size-6 rounded border border-border"
              style={{ background: token.resolvedValue ?? token.value }}
              title={`${token.name} ${token.resolvedValue ?? token.value}`}
            />
          ))}
        </div>
      ) : null}

      {unresolved.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          <div>
            <p className="font-medium text-primary">
              {unresolved.length === 1
                ? 'One thing disagrees with what we had'
                : `${unresolved.length} things disagree with what we had`}
            </p>
            <p className="mt-0.5 text-secondary">{unresolved[0].detail}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
