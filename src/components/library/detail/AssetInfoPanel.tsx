'use client';

// The detail sidebar's Info tab: every built-in fact we hold about an asset, in Frame.io's
// order of concern — the file, its picture and sound, then the workflow around it (status,
// keywords, comment count, who has seen it, notes). Values are formatted by the same
// cardFieldValue the cards and List columns use, so a fact reads the same everywhere.
//
// An older version on stage shows that version's own file facts; the probe's technical
// fields and the workflow describe the asset's current head, so they are not repeated there.

import {
  MAX_ASSET_NOTES_LENGTH,
  type MediaAsset,
  type MediaAssetVersion,
} from '@continuum/contracts';
import { Eye, Loader2, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast-imperative';
import { setAssetNotesOperation } from '@/lib/library/creativeOperations';
import { normalizeReviewStatus } from '@/lib/library/reviewStatus';
import { useLibraryAccess } from '@/lib/library/useBrandRole';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { reviewDisplay } from '../review/reviewDisplay';
import { useReviewCustomStates, useReviewStateLabels } from '../review/useReviewStateLabels';
import {
  BUILT_IN_CARD_FIELDS,
  type CardFieldLookups,
  cardFieldValue,
  type LibraryFieldGroup,
  memberNameLookup,
} from '../views/cardOptions';
import { useAssetCommentCounts } from '../views/useAssetFieldValues';
import { useMentionTargets } from './useMentionTargets';

const SECTIONS: { group: LibraryFieldGroup; label: string }[] = [
  { group: 'file', label: 'File' },
  { group: 'document', label: 'Document' },
  { group: 'video', label: 'Video' },
  { group: 'audio', label: 'Audio' },
  { group: 'workflow', label: 'Workflow' },
];

// Drawn by their own controls below rather than as a plain row.
const OWN_CONTROL = new Set(['title', 'notes', 'hasLocation']);

// A non-head version only knows its own file columns; everything else is the head's.
const VERSION_FIELDS = new Set(['fileName', 'kind', 'format', 'size', 'dimensions', 'duration']);

type SeenBy = { userId: string; lastSeenAt: string; viewCount: number };

function useSeenBy(assetId: string): SeenBy[] | null {
  const [seen, setSeen] = useState<SeenBy[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSeen(null);
    void Promise.resolve(
      mediaSchema(createSupabaseBrowserClient())
        .from('asset_views')
        .select('user_id, last_seen_at, view_count')
        .eq('asset_id', assetId)
        .order('last_seen_at', { ascending: false }),
    ).then(({ data, error }) => {
      if (cancelled) return;
      const rows = (error ? [] : (data ?? [])) as {
        user_id: string;
        last_seen_at: string;
        view_count: number;
      }[];
      setSeen(
        rows.map((row) => ({
          userId: row.user_id,
          lastSeenAt: row.last_seen_at,
          viewCount: row.view_count,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  return seen;
}

function NotesEditor({ asset, canEdit }: { asset: MediaAsset; canEdit: boolean }) {
  const [stored, setStored] = useState(asset.notes ?? '');
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setStored(asset.notes ?? '');
    setDraft(asset.notes ?? '');
  }, [asset.notes]);

  const commit = async () => {
    const next = draft.trim();
    if (next === stored.trim()) return;
    setSaving(true);
    try {
      const saved = await setAssetNotesOperation(createSupabaseBrowserClient(), {
        brandId: asset.brandId,
        assetId: asset.id,
        notes: next || null,
      });
      setStored(saved.notes ?? '');
      setDraft(saved.notes ?? '');
    } catch (err) {
      setDraft(stored);
      toast.error(`Saving notes failed · ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <p data-testid="asset-info-notes" className="text-xs whitespace-pre-wrap">
        {stored || <span className="text-muted-foreground">No notes</span>}
      </p>
    );
  }
  return (
    <div className="relative">
      <Textarea
        data-testid="asset-info-notes"
        value={draft}
        disabled={saving}
        aria-label="Notes"
        placeholder="Add notes for your team"
        maxLength={MAX_ASSET_NOTES_LENGTH}
        className="min-h-20 text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
      />
      {saving ? (
        <Loader2 className="absolute top-2 right-2 size-3 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}

export function AssetInfoPanel({
  asset,
  version,
}: {
  asset: MediaAsset;
  version: MediaAssetVersion | null;
}) {
  const olderVersion = version && !version.isHead ? version : null;
  const shown: MediaAsset = olderVersion
    ? {
        ...asset,
        fileName: olderVersion.fileName,
        mimeType: olderVersion.mimeType,
        sizeBytes: olderVersion.sizeBytes,
        width: olderVersion.width,
        height: olderVersion.height,
        durationMs: olderVersion.durationMs,
      }
    : asset;

  const members = useMentionTargets(asset.brandId);
  const memberName = memberNameLookup(members);
  const commentCount = useAssetCommentCounts([asset.id], !olderVersion);
  const reviewLabels = useReviewStateLabels(asset.brandId);
  const customStates = useReviewCustomStates(asset.brandId);
  const seenBy = useSeenBy(asset.id);
  const { canEdit } = useLibraryAccess(asset.brandId, { assetId: asset.id });
  const lookups: CardFieldLookups = {
    commentCount,
    memberName,
    reviewLabel: (item) =>
      reviewDisplay(
        normalizeReviewStatus(item.reviewStatus),
        item.reviewStateId,
        reviewLabels,
        customStates,
      ).label,
  };

  const sections = SECTIONS.map(({ group, label }) => ({
    // The picture fields (colour space, bit depth, alpha) describe a still as much as a clip.
    label: group === 'video' && shown.kind === 'image' ? 'Image' : label,
    rows: BUILT_IN_CARD_FIELDS.filter(
      (field) =>
        field.group === group &&
        !OWN_CONTROL.has(field.key) &&
        (!olderVersion || VERSION_FIELDS.has(field.key)),
    ).flatMap((field) => {
      const value = cardFieldValue(shown, field.key, lookups);
      // A kind's own fields and the kind-less workflow facts show even while empty.
      const expected =
        'kinds' in field ? field.kinds.includes(shown.kind) : field.group === 'workflow';
      return value !== null || expected ? [{ key: field.key, label: field.label, value }] : [];
    }),
  })).filter((section) => section.rows.length > 0);

  const awaitingProbe = !olderVersion && !asset.mediaProbedAt && asset.kind !== 'file';

  return (
    <div data-testid="asset-info-panel" className="flex flex-col gap-4 p-3 text-xs">
      {olderVersion ? (
        <p className="text-muted-foreground">
          Version {olderVersion.versionNumber}. Technical and workflow details describe the current
          version.
        </p>
      ) : null}

      {!olderVersion && asset.hasLocation ? (
        <Badge
          data-testid="asset-info-gps-badge"
          variant="warning"
          title="This file carries GPS coordinates. Shared copies have them removed; the original keeps them."
        >
          <MapPin />
          Location data
        </Badge>
      ) : null}

      {awaitingProbe ? (
        <p className="text-muted-foreground">
          {asset.mediaProbeError
            ? `Some technical details could not be read: ${asset.mediaProbeError}`
            : 'Technical details appear once the file has been read.'}
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-1.5">
          <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            {section.label}
          </h3>
          <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5">
            {section.rows.map((row) => (
              <div
                key={row.key}
                data-testid={`asset-info-row-${row.key}`}
                data-value={row.value ?? ''}
                className="contents"
              >
                <dt className="truncate text-muted-foreground">{row.label}</dt>
                <dd className="truncate tabular-nums" title={row.value ?? undefined}>
                  {row.value ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {!olderVersion ? (
        <>
          <section className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              <Eye className="size-3" aria-hidden />
              Seen by
            </h3>
            {seenBy === null ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : seenBy.length === 0 ? (
              <p className="text-muted-foreground">Nobody has opened this yet.</p>
            ) : (
              <ul data-testid="asset-info-seen-by" className="flex flex-col gap-1">
                {seenBy.map((entry) => (
                  <li
                    key={entry.userId}
                    data-testid="asset-info-seen-by-user"
                    data-user-id={entry.userId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{memberName ? (memberName(entry.userId) ?? 'Former member') : '…'}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {new Date(entry.lastSeenAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {entry.viewCount > 1 ? ` · ${entry.viewCount}×` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              Notes
            </h3>
            <NotesEditor asset={asset} canEdit={canEdit} />
          </section>
        </>
      ) : null}
    </div>
  );
}
