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
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useState, useMemo as useUiConfigMemo } from 'react';
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
import { useCardFieldDisplay, useLibraryFieldOptions } from '../views/useLibraryFieldOptions';
import { useMentionTargets } from './useMentionTargets';

function useLocalSectionsMessages() {
  const translateConfig = useUiTranslations('library');
  return useUiConfigMemo(() => {
    const value: { group: LibraryFieldGroup; label: string }[] = [
      { group: 'file', label: translateConfig('file_50009ce1') },
      { group: 'document', label: translateConfig('document_d6bd8c0a') },
      { group: 'video', label: translateConfig('video_d534be82') },
      { group: 'audio', label: translateConfig('audio_bc1b8890') },
      { group: 'workflow', label: translateConfig('workflow_2e2d5c56') },
    ];
    return value;
  }, [translateConfig]);
}

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
  const translateUi = useUiTranslations('library');

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
      toast.error(
        translateUi('saving_notes_failed_value0_4ebffad8', {
          value0: String((err as Error).message),
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <p data-testid="asset-info-notes" className="text-xs whitespace-pre-wrap">
        {stored || (
          <span className="text-muted-foreground">{translateUi('no_notes_efe1cde6')}</span>
        )}
      </p>
    );
  }
  return (
    <div className="relative">
      <Textarea
        data-testid="asset-info-notes"
        value={draft}
        disabled={saving}
        aria-label={translateUi('notes_8a7525b1')}
        placeholder={translateUi('add_notes_for_your_team_87cc629f')}
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
  const SECTIONS = useLocalSectionsMessages();

  const displayLocale = useUiLocale();

  const translateUi = useUiTranslations('library');
  const fieldDisplay = useCardFieldDisplay();
  const { fields: BUILT_IN_CARD_FIELDS } = useLibraryFieldOptions();

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
    ...fieldDisplay,
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
    label: group === 'video' && shown.kind === 'image' ? translateUi('image_1aa4cb0b') : label,
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
          {' '}
          {translateUi('version_dd167905')} {olderVersion.versionNumber}
          {translateUi('technical_and_workflow_details_desc_949a3513')}{' '}
        </p>
      ) : null}

      {!olderVersion && asset.hasLocation ? (
        <Badge
          data-testid="asset-info-gps-badge"
          variant="warning"
          title={translateUi('this_file_carries_gps_coordinates_s_0d50a50f')}
        >
          <MapPin /> {translateUi('location_data_f94fade1')}{' '}
        </Badge>
      ) : null}

      {awaitingProbe ? (
        <p className="text-muted-foreground">
          {asset.mediaProbeError
            ? translateUi('some_technical_details_could_not_be_14af4983', {
                value0: String(asset.mediaProbeError),
              })
            : translateUi('technical_details_appear_once_the_f_23233cbf')}
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
              <Eye className="size-3" aria-hidden /> {translateUi('seen_by_7fb44fd2')}{' '}
            </h3>
            {seenBy === null ? (
              <p className="text-muted-foreground">{translateUi('loading_ba3bbbe1')}</p>
            ) : seenBy.length === 0 ? (
              <p className="text-muted-foreground">
                {translateUi('nobody_has_opened_this_yet_3b90a180')}
              </p>
            ) : (
              <ul data-testid="asset-info-seen-by" className="flex flex-col gap-1">
                {seenBy.map((entry) => (
                  <li
                    key={entry.userId}
                    data-testid="asset-info-seen-by-user"
                    data-user-id={entry.userId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {memberName
                        ? (memberName(entry.userId) ?? translateUi('former_member_1ef15417'))
                        : '…'}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {new Date(entry.lastSeenAt).toLocaleDateString(displayLocale, {
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
              {' '}
              {translateUi('notes_8a7525b1')}{' '}
            </h3>
            <NotesEditor asset={asset} canEdit={canEdit} />
          </section>
        </>
      ) : null}
    </div>
  );
}
