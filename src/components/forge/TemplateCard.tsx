'use client';

import {
  type ApiRenderJob,
  type ApiRenderOutput,
  apiRenderVariableLabel,
  readableLayerName,
  type TemplateFontReadiness,
  type TemplateSourceSummary,
  templateDisplayName,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Fingerprint,
  GitCommitVertical,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  RectangleHorizontal,
  Type,
  Variable,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { FactList } from '@/components/forge/FactList';
import {
  fileForFormat,
  type PreviewFormat,
  previewFormats,
} from '@/components/forge/FormatPreview';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import type { TemplateVariablesResponse } from '@/lib/library/templateSources';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { TemplateMorph, TemplateWireframe } from './TemplateWireframe';

// One template as a card: its newest rendered frame, what it is called, and where it stands. The
// facts behind it — formats, variables, fonts, version and digest — wait in a hover card. Everything
// a person would have to decode — the upload's uuid filename, the render table, the workspace, the
// version hash — stays off its face.

export type TemplateStatus =
  | 'reading'
  | 'parsed'
  | 'building'
  | 'draft'
  | 'ready'
  | 'needs_input'
  | 'failed';

export const TEMPLATE_STATUS: Record<
  TemplateStatus,
  {
    label: string;
    tone: 'success' | 'error' | 'warning' | 'info';
    group: 'ready' | 'drafts' | 'attention';
  }
> = {
  reading: { label: 'Unpacking', tone: 'info', group: 'drafts' },
  parsed: { label: 'Parsed', tone: 'info', group: 'drafts' },
  building: { label: 'Building', tone: 'info', group: 'drafts' },
  draft: { label: 'Draft', tone: 'warning', group: 'drafts' },
  ready: { label: 'Ready', tone: 'success', group: 'ready' },
  needs_input: { label: 'Needs input', tone: 'warning', group: 'attention' },
  failed: { label: 'Failed', tone: 'error', group: 'attention' },
};

/**
 * Where a template stands, from the three facts that decide it.
 *
 * A template key is the only thing that means renderable — a forge run can say `published` against
 * a package the fleet never promoted and hand back a blank frame — so it outranks the run state.
 */
export function templateStatus(input: {
  parseState: string;
  forgeState: string | null | undefined;
  templateKey: string | null;
}): TemplateStatus {
  if (input.templateKey) return 'ready';
  if (input.parseState === 'pending') return 'reading';
  if (input.parseState !== 'parsed') return 'failed';
  switch (input.forgeState) {
    case null:
    case undefined:
      return 'parsed';
    case 'failed':
      return 'failed';
    case 'needs_input':
      return 'needs_input';
    case 'draft_ready':
    case 'review_ready':
      return 'draft';
    default:
      return 'building';
  }
}

export function sourceDisplayName(source: TemplateSourceSummary): string {
  return source.displayName ?? templateDisplayName(source.parse?.filename);
}

export function TemplateStatusPill({ status }: { status: TemplateStatus }) {
  const { label, tone } = TEMPLATE_STATUS[status];
  return (
    <Pill aria-live="polite">
      <PillIndicator variant={tone} pulse={status === 'building' || status === 'reading'} />
      {label}
    </Pill>
  );
}

/** A name that turns into a field: pencil or double-click to edit, Enter saves, Esc or leaving cancels. */
export function InlineRename({
  value,
  onRename,
  className,
}: {
  value: string;
  onRename: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const begin = () => {
    setText(value);
    setEditing(true);
  };

  if (editing) {
    return (
      <Input
        // biome-ignore lint/a11y/noAutofocus: the person just asked to edit this name
        autoFocus
        value={text}
        maxLength={120}
        aria-label={`Rename ${value}`}
        className={cn('relative z-10 h-8 pointer-events-auto', className)}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
          }
          if (event.key !== 'Enter') return;
          event.preventDefault();
          setEditing(false);
          const next = text.trim();
          if (next && next !== value) onRename(next);
        }}
      />
    );
  }

  return (
    <span
      className={cn(
        'group/rename pointer-events-auto relative z-10 inline-flex max-w-full items-center gap-1',
        className,
      )}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a shortcut beside the pencil button, which is the accessible path */}
      <span className="truncate" title={value} onDoubleClick={begin}>
        {value}
      </span>
      <button
        type="button"
        aria-label={`Rename ${value}`}
        onClick={begin}
        className="pointer-events-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-hover/rename:opacity-100"
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

function RatioChips({ ratios }: { ratios: string[] }) {
  const shown = ratios.slice(0, 4);
  return (
    <>
      {shown.map((ratio) => (
        <Pill key={ratio} variant="muted">
          {ratio}
        </Pill>
      ))}
      {ratios.length > shown.length ? (
        <Pill variant="muted">+{ratios.length - shown.length}</Pill>
      ) : null}
    </>
  );
}

export type CardRender = { job: ApiRenderJob; file: ApiRenderOutput };

/**
 * The picture a card shows: the newest finished render's file for the first format it rendered,
 * found by file name — the fleet lists a job's files in a new order every time, so position means
 * nothing. `jobs` is newest first.
 */
export function latestCardRender(
  jobs: readonly ApiRenderJob[],
  formats: readonly PreviewFormat[],
): CardRender | null {
  for (const job of jobs) {
    if (!formats.length) {
      // ponytail: a shared template carries no parse, so its formats are unknown. The first still
      // by NAME (never by position) keeps one ratio from job to job; give shared templates their
      // formats when the discover route carries them.
      const [file] = [...job.outputs].sort(
        (a, b) =>
          Number(a.kind !== 'image') - Number(b.kind !== 'image') ||
          a.fileName.localeCompare(b.fileName),
      );
      if (file) return { job, file };
      continue;
    }
    for (const format of formats) {
      const file = fileForFormat(job.outputs, formats, format.id);
      if (file) return { job, file };
    }
  }
  return null;
}

/** The card's picture: the rendered file, else the drawing of the boxes with a word on why. */
function CardPicture({
  name,
  render,
  emptyLabel,
  children,
}: {
  name: string;
  render: CardRender | null;
  /** Null while the renders are still being read: no claim either way. */
  emptyLabel: string | null;
  /** The wireframe, drawn when there is no file to show. */
  children: ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (render && !broken) {
    return render.file.kind === 'video' ? (
      // biome-ignore lint/a11y/useMediaCaption: a silent preview frame has no captions to show
      <video
        src={`${render.file.url}#t=0.1`}
        aria-label={`${name} · last render`}
        className="size-full object-contain"
        muted
        playsInline
        preload="metadata"
        onError={() => setBroken(true)}
      />
    ) : (
      // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
      <img
        src={render.file.url}
        alt={`${name} · last render`}
        className="size-full object-contain"
        onError={() => setBroken(true)}
      />
    );
  }
  const label = render ? "The last render's file didn't load" : emptyLabel;
  return (
    <div className="relative size-full">
      {children}
      {label ? (
        <span className="absolute bottom-2 left-2 rounded-sm bg-background/90 px-1.5 py-0.5 text-2xs text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
}

// The ledger's reading of a version (templateVersion.ts): a source revision and the day it was used.
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * What a card knows, on hover: read from the gallery's list and whatever this page already has in
 * its cache — never a fetch of its own. Named-variable and missing-font counts need the template's
 * own reads, so they appear once the template has been opened.
 */
function TemplateFacts({
  brandId,
  source,
  lastRender,
  emptyLabel,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  lastRender: ApiRenderJob | undefined;
  emptyLabel: string | null;
}) {
  const queryClient = useQueryClient();
  const variables = queryClient.getQueryData<TemplateVariablesResponse>(
    forgeQueryKeys.templateVariables(brandId, source.assetId, source.versionId),
  )?.variables;
  const fonts = queryClient.getQueryData<TemplateFontReadiness>(
    forgeQueryKeys.templateFonts(brandId, source.assetId, source.versionId),
  );
  const variableCount = variables?.length ?? source.slotCount ?? 0;
  const unnamed =
    variables?.filter((variable) => {
      const label = apiRenderVariableLabel(variable);
      return readableLayerName(label) !== label;
    }).length ?? 0;
  const fontCount = fonts?.fonts.length ?? source.fonts.length;
  const missing = fonts?.fonts.filter((font) => !font.held).length ?? 0;
  const revisionNumber = lastRender?.templateSource?.versionNumber;
  const revision =
    lastRender && revisionNumber
      ? `Rev ${revisionNumber} · ${shortDate(lastRender.createdAt)}`
      : '—';

  return (
    <div className="flex flex-col gap-2">
      <p className="truncate text-sm font-medium">{sourceDisplayName(source)}</p>
      <FactList
        facts={[
          {
            icon: RectangleHorizontal,
            label: 'Formats',
            value: source.ratios.length ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {source.ratios.map((ratio) => (
                  <span
                    key={ratio}
                    className="inline-flex items-center gap-1 font-mono tabular-nums"
                  >
                    <RatioGlyph ratio={ratio} className="text-muted-foreground" />
                    {ratio}
                  </span>
                ))}
              </span>
            ) : (
              '—'
            ),
          },
          {
            icon: Variable,
            label: 'Variables',
            numeric: true,
            value: unnamed ? `${variableCount} · ${unnamed} unnamed` : variableCount,
          },
          {
            icon: Type,
            label: 'Fonts',
            numeric: true,
            value: missing ? `${fontCount} · ${missing} missing` : fontCount,
          },
          {
            icon: History,
            label: 'Last render',
            numeric: true,
            value: lastRender
              ? formatRelativeTime(lastRender.finishedAt ?? lastRender.updatedAt)
              : (emptyLabel ?? '…'),
          },
          { icon: GitCommitVertical, label: 'Version', value: revision },
          {
            icon: Fingerprint,
            label: 'Digest',
            value: source.aepSha256 ? (
              <span className="break-all font-mono text-2xs">{source.aepSha256}</span>
            ) : (
              'Not published'
            ),
          },
        ]}
      />
    </div>
  );
}

export function TemplateCard({
  brandId,
  source,
  renders,
  emptyLabel,
  onOpen,
  onRename,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  /** This template's finished renders from the gallery's one list, newest first. */
  renders: readonly ApiRenderJob[];
  /** What a card with no render says: null while the list is loading. */
  emptyLabel: string | null;
  onOpen: () => void;
  onRename: (title: string) => void;
}) {
  const name = sourceDisplayName(source);
  const status = templateStatus(source);
  const formats = useMemo(
    () => previewFormats({ parse: source.parse, ratios: source.ratios }),
    [source.parse, source.ratios],
  );
  const render = latestCardRender(renders, formats);
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40">
      {/* The whole card opens the detail and, held, shows its facts; the rename controls sit above
          this layer. */}
      <HoverCard openDelay={400} closeDelay={80}>
        <HoverCardTrigger
          render={
            <button
              type="button"
              aria-label={`Open ${name}`}
              onClick={onOpen}
              className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        />
        <HoverCardContent side="right" align="start" className="w-80 p-3">
          <TemplateFacts
            brandId={brandId}
            source={source}
            lastRender={renders[0]}
            emptyLabel={emptyLabel}
          />
        </HoverCardContent>
      </HoverCard>
      <TemplateMorph id={source.assetId}>
        <div className="pointer-events-none aspect-[4/3] border-b bg-muted/40">
          <CardPicture
            key={render?.file.url ?? 'none'}
            name={name}
            render={render}
            emptyLabel={emptyLabel}
          >
            <TemplateWireframe
              brandId={brandId}
              templateKey={source.templateKey}
              parse={source.parse}
              className="h-full w-full p-4"
            />
          </CardPicture>
        </div>
      </TemplateMorph>
      <div className="pointer-events-none flex min-w-0 flex-col gap-2 p-3">
        <InlineRename
          value={name}
          onRename={onRename}
          className="pointer-events-none z-20 text-sm font-medium"
        />
        <div className="flex flex-wrap items-center gap-1">
          <TemplateStatusPill status={status} />
          <RatioChips ratios={source.ratios} />
          {source.slotCount ? (
            <span className="text-2xs text-muted-foreground">
              {source.slotCount} variable{source.slotCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** A template someone else built into the shared workspace, which this brand can add. */
export type SharedTemplate = {
  templateKey: string;
  name: string;
  displayName?: string | null;
  draft: boolean;
  granted: boolean;
  updatedAt: string | null;
  /** The binding this template lives in. Always set — adoption and rendering both need it. */
  workspaceId: string;
};

/**
 * What tells two shared templates apart. `templateKey` alone does not: it is a NocoBase row id,
 * unique only within a sub-app, so a brand bound to two of them can hold the same id twice.
 */
export function sharedTemplateId(template: SharedTemplate): string {
  return `${template.workspaceId}:${template.templateKey}`;
}

export function SharedTemplateCard({
  brandId,
  template,
  brandName,
  renders,
  emptyLabel,
  busy,
  onOpen,
  onToggle,
  onRender,
}: {
  brandId: string;
  template: SharedTemplate;
  brandName?: string;
  renders: readonly ApiRenderJob[];
  emptyLabel: string | null;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onRender?: () => void;
}) {
  const name = template.displayName ?? templateDisplayName(template.name);
  const brand = brandName ?? 'this brand';
  const render = latestCardRender(renders, []);
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40">
      {/* The whole card opens the detail; the Use / Remove / Render controls sit above this layer. */}
      <button
        type="button"
        aria-label={`Open ${name}`}
        onClick={onOpen}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="pointer-events-none aspect-[4/3] border-b bg-muted/40">
        <CardPicture
          key={render?.file.url ?? 'none'}
          name={name}
          render={render}
          emptyLabel={emptyLabel}
        >
          <TemplateWireframe
            brandId={brandId}
            templateKey={template.granted ? template.templateKey : null}
            parse={null}
            className="size-full p-4"
          />
        </CardPicture>
      </div>
      <div className="pointer-events-none flex min-w-0 flex-col gap-2 p-3">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <TemplateStatusPill status={template.draft ? 'draft' : 'ready'} />
          <span className="text-2xs text-muted-foreground">Shared with you</span>
        </div>
        {/* Using one is a permission, not a copy: a grant this brand can take back. */}
        <div className="pointer-events-auto relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1">
          {template.granted ? (
            <>
              <span className="inline-flex items-center gap-1 text-xs">
                In {brand}
                <Check className="size-3.5 text-success" aria-hidden />
              </span>
              <span aria-hidden className="text-xs text-muted-foreground">
                ·
              </span>
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto gap-1 px-0 text-xs"
                aria-label={`Remove ${name} from ${brand}`}
                disabled={busy}
                onClick={onToggle}
              >
                {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                Remove
              </Button>
              {!template.draft && onRender ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto gap-1.5"
                  onClick={onRender}
                >
                  <Play className="size-3.5" aria-hidden />
                  Render
                </Button>
              ) : null}
            </>
          ) : (
            <Button type="button" size="sm" className="gap-1.5" disabled={busy} onClick={onToggle}>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-3.5" aria-hidden />
              )}
              Use in {brand}
            </Button>
          )}
        </div>
        <p className="text-2xs text-muted-foreground">
          Lets {brand} render this template. Nothing is copied — it stays in the shared library.
          Remove any time.
        </p>
      </div>
    </article>
  );
}
