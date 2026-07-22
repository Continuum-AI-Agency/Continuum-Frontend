// Normalizes the two parallel account shapes the assignment editor consumes —
// Meta ad-account bundles and the flat per-platform list — into one flat list of
// selectable "sections". A section is a labelled cluster with its own select-all
// (an ad account + its child pages/IG, a standalone Meta bucket, or a single
// non-Meta platform). Meta assets arrive exclusively through `metaBundles`; the
// facebook/instagram/threads keys in the flat grouping are intentionally ignored
// here to avoid double-listing them.

import { PLATFORMS, type PlatformKey } from '@/components/onboarding/platforms';
import { isReadOnlyMetaRole } from '@/lib/integrations/metaRole';
import { mapIntegrationTypeToPlatformKey } from '@/lib/integrations/platform';
import type { MetaSelectableAdAccountBundles } from '@/lib/integrations/selectableAssets';
import {
  getSelectableAssetLabel,
  getSelectableAssetsFlatList,
} from '@/lib/integrations/selectableAssets';
import type { SelectableAsset, SelectableAssetsResponse } from '@/lib/schemas/integrations';

export type AssignmentRow = {
  // Id used as the key in the caller's `selectedById` toggle map.
  selectionId: string;
  // Stable React key.
  assetPk: string;
  label: string;
  iconPlatformKey: PlatformKey | null;
  externalId: string;
  businessId: string | null;
  readOnly: boolean;
};

export type AssignmentSection = {
  key: string;
  title: string;
  subtitle: string | null;
  // Groups sections under a shared band ("Meta", "Google"); null renders standalone.
  providerLabel: string | null;
  iconPlatformKey: PlatformKey;
  readOnly: boolean;
  rows: AssignmentRow[];
  // Selectable ids toggled by this section's select-all that have no visible row
  // (a Meta ad account is toggled with its children but is never its own row).
  extraSelectionIds: string[];
};

const META_KEYS: PlatformKey[] = ['facebook', 'instagram', 'threads'];
const GOOGLE_KEYS: PlatformKey[] = ['youtube', 'googleAds', 'googleAnalytics', 'dv360'];

const PLATFORM_LABEL_BY_KEY = new Map<PlatformKey, string>(
  PLATFORMS.map(({ key, label }) => [key, label]),
);

function platformLabel(key: PlatformKey): string {
  return PLATFORM_LABEL_BY_KEY.get(key) ?? key;
}

function selectionIdOf(asset: SelectableAsset): string | null {
  return asset.integration_account_id || asset.asset_pk || null;
}

function toRow(asset: SelectableAsset): AssignmentRow | null {
  const selectionId = selectionIdOf(asset);
  if (!selectionId) return null;
  return {
    selectionId,
    assetPk: asset.asset_pk,
    label: getSelectableAssetLabel(asset),
    iconPlatformKey: mapIntegrationTypeToPlatformKey(asset.type),
    externalId: asset.external_id || asset.asset_pk,
    businessId: asset.business_id ?? null,
    readOnly: isReadOnlyMetaRole(asset.role),
  };
}

function toRows(assets: SelectableAsset[]): AssignmentRow[] {
  return assets.map(toRow).filter((row): row is AssignmentRow => row !== null);
}

function groupNonMetaAssets(
  data: SelectableAssetsResponse | null,
): Map<PlatformKey, SelectableAsset[]> {
  const grouped = new Map<PlatformKey, SelectableAsset[]>();
  if (!data) return grouped;

  getSelectableAssetsFlatList(data).forEach((asset) => {
    const key = mapIntegrationTypeToPlatformKey(asset.type);
    // Meta assets are surfaced through `metaBundles`, never the flat grouping.
    if (!key || META_KEYS.includes(key)) return;
    const bucket = grouped.get(key) ?? [];
    bucket.push(asset);
    grouped.set(key, bucket);
  });

  return grouped;
}

function makePlatformSection(
  key: PlatformKey,
  assets: SelectableAsset[],
  providerLabel: string | null,
): AssignmentSection {
  return {
    key: `platform:${key}`,
    title: platformLabel(key),
    subtitle: null,
    providerLabel,
    iconPlatformKey: key,
    readOnly: false,
    rows: toRows(assets),
    extraSelectionIds: [],
  };
}

function makeMetaSections(metaBundles: MetaSelectableAdAccountBundles | null): AssignmentSection[] {
  if (!metaBundles) return [];
  const sections: AssignmentSection[] = [];

  metaBundles.ad_accounts.forEach((bundle) => {
    const adAccountSelectionId = bundle.ad_account ? selectionIdOf(bundle.ad_account) : null;
    sections.push({
      key: `meta-ad-account:${bundle.ad_account_id}`,
      title: bundle.ad_account ? getSelectableAssetLabel(bundle.ad_account) : bundle.ad_account_id,
      subtitle: null,
      providerLabel: 'Meta',
      iconPlatformKey: 'facebook',
      readOnly: isReadOnlyMetaRole(bundle.ad_account?.role),
      rows: toRows(bundle.assets),
      extraSelectionIds: adAccountSelectionId ? [adAccountSelectionId] : [],
    });
  });

  if (metaBundles.assets_without_ad_account.length > 0) {
    sections.push({
      key: 'meta-standalone',
      title: 'Standalone Meta accounts',
      subtitle: 'Not attached to a Meta ad account',
      providerLabel: 'Meta',
      iconPlatformKey: 'facebook',
      readOnly: false,
      rows: toRows(metaBundles.assets_without_ad_account),
      extraSelectionIds: [],
    });
  }

  return sections;
}

export function buildAssignmentSections(
  data: SelectableAssetsResponse | null,
  metaBundles: MetaSelectableAdAccountBundles | null,
): AssignmentSection[] {
  const grouped = groupNonMetaAssets(data);
  const googleSections = GOOGLE_KEYS.map((key) => {
    const assets = grouped.get(key);
    return assets && assets.length > 0 ? makePlatformSection(key, assets, 'Google') : null;
  }).filter((section): section is AssignmentSection => section !== null);

  const otherSections = PLATFORMS.map(({ key }) => {
    if (META_KEYS.includes(key) || GOOGLE_KEYS.includes(key)) return null;
    const assets = grouped.get(key);
    return assets && assets.length > 0 ? makePlatformSection(key, assets, null) : null;
  }).filter((section): section is AssignmentSection => section !== null);

  return [...makeMetaSections(metaBundles), ...googleSections, ...otherSections];
}

export type FilteredSection = {
  visibleRows: AssignmentRow[];
  titleMatched: boolean;
};

// Narrows a section's rows to a search query. A query hit on the section title
// (ad account / platform name) keeps every row; otherwise only rows whose label
// or id match survive.
export function filterSection(section: AssignmentSection, query: string): FilteredSection {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return { visibleRows: section.rows, titleMatched: false };

  if (section.title.toLowerCase().includes(trimmed)) {
    return { visibleRows: section.rows, titleMatched: true };
  }

  const visibleRows = section.rows.filter(
    (row) =>
      row.label.toLowerCase().includes(trimmed) || row.externalId.toLowerCase().includes(trimmed),
  );
  return { visibleRows, titleMatched: false };
}

// Ids a section's select-all toggles: the visible rows, plus the section's extra
// ids (e.g. the Meta ad account) only when the whole section is in view.
export function sectionToggleIds(
  section: AssignmentSection,
  visibleRows: AssignmentRow[],
  includeExtra: boolean,
): string[] {
  const ids = visibleRows.map((row) => row.selectionId);
  if (includeExtra) ids.push(...section.extraSelectionIds);
  return Array.from(new Set(ids));
}
