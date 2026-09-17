'use client';

import { type TemplateSourceSummary, templateDisplayName } from '@continuum/contracts';
import { Check, Loader2, Pencil, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TemplateMorph, TemplateWireframe } from './TemplateWireframe';
import { shortSha } from './templateVersion';

// One template as a card: its picture, what it is called, and where it stands. Everything a person
// would have to decode — the upload's uuid filename, the render table, the workspace — stays off it.

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
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/rename:opacity-100"
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

export function TemplateCard({
  brandId,
  source,
  onOpen,
  onRename,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  onOpen: () => void;
  onRename: (title: string) => void;
}) {
  const name = sourceDisplayName(source);
  const status = templateStatus(source);
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40">
      {/* The whole card opens the detail; the rename controls sit above this layer. */}
      <button
        type="button"
        aria-label={`Open ${name}`}
        onClick={onOpen}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <TemplateMorph id={source.assetId}>
        <div className="pointer-events-none aspect-[4/3] border-b">
          <TemplateWireframe
            brandId={brandId}
            templateKey={source.templateKey}
            parse={source.parse}
            className="h-full w-full p-4"
          />
        </div>
      </TemplateMorph>
      <div className="pointer-events-none flex min-w-0 flex-col gap-2 p-3">
        <InlineRename value={name} onRename={onRename} className="text-sm font-medium" />
        <div className="flex flex-wrap items-center gap-1">
          <TemplateStatusPill status={status} />
          <RatioChips ratios={source.ratios} />
          {source.slotCount ? (
            <span className="text-2xs text-muted-foreground">
              {source.slotCount} variable{source.slotCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {/* The version: the exact bytes this template was promoted as. Not the source revision
              (an upload of the file someone dropped in) and not the contract hash. */}
          {source.aepSha256 ? (
            <span
              className="text-2xs font-mono text-muted-foreground tabular-nums"
              title={`Template version ${source.aepSha256}`}
            >
              {shortSha(source.aepSha256)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * A template someone else built into the shared workspace, which this brand can add.
 *
 * ponytail: no detail panel — without a Library source there are no variables, history or revisions
 * to show. Give it one when shared templates carry settings a brand can change.
 */
export type SharedTemplate = {
  templateKey: string;
  name: string;
  displayName?: string | null;
  draft: boolean;
  granted: boolean;
  updatedAt: string | null;
  /** Set only when the brand has several workspaces, so adoption names the right one. */
  workspaceId?: string;
};

/**
 * What tells two shared templates apart. `templateKey` alone does not: it is a NocoBase row id, and
 * a brand with several workspaces can hold the same id in two of them.
 */
export function sharedTemplateId(template: SharedTemplate): string {
  return `${template.workspaceId ?? 'default'}:${template.templateKey}`;
}

export function SharedTemplateCard({
  brandId,
  template,
  brandName,
  busy,
  onToggle,
  onRender,
}: {
  brandId: string;
  template: SharedTemplate;
  brandName?: string;
  busy: boolean;
  onToggle: () => void;
  onRender?: () => void;
}) {
  const name = template.displayName ?? templateDisplayName(template.name);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <TemplateWireframe
        brandId={brandId}
        templateKey={template.granted ? template.templateKey : null}
        parse={null}
        className="aspect-[4/3] border-b p-4"
      />
      <div className="flex min-w-0 flex-col gap-2 p-3">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <TemplateStatusPill status={template.draft ? 'draft' : 'ready'} />
          <span className="text-2xs text-muted-foreground">Shared with you</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={template.granted ? 'outline' : 'default'}
            className="gap-1.5"
            disabled={busy}
            title={template.granted ? `Remove from ${brandName ?? 'this brand'}` : undefined}
            onClick={onToggle}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : template.granted ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Plus className="size-3.5" aria-hidden />
            )}
            {template.granted ? 'Added' : `Add to ${brandName ?? 'this brand'}`}
          </Button>
          {template.granted && !template.draft && onRender ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onRender}
            >
              <Play className="size-3.5" aria-hidden />
              Render
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
