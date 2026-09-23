'use client';

import type {
  ApiRenderDeliveryDestinationsResponse,
  ApiRenderDeliveryTarget,
  PaidCanvasTarget,
} from '@continuum/contracts';
import { ChevronRight, ClipboardPaste, Loader2, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { RenderPreflightRow } from '@/components/forge/RenderReviewTray';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { publishingApi } from '@/StudioCanvas/nodes/publish/publishingApi';

// Which Meta ad each row's render replaces, or which ad set gets it as a new paused ad, if any.
// Nothing here writes to Meta: the pick is a target the delivery parks at `awaiting_approval`, and
// a person approves it in Slack or Forge.
//
// A replace swaps exactly ONE creative, so a replacing row renders exactly one format — the
// dialog owns that choice (`formatByRow`) and applies it to the record at confirm. A new ad takes
// every format the row renders, one ad per file, so it asks for none. Targets come
// from one of the brand's linked ad accounts — the assigned one unless another is picked — via
// the paid targets route; the canvas Publishing block drills the same route (PublishingBlock.tsx),
// but it is bound to the canvas store.

export type MetaPickerState = 'loading' | 'unknown' | ApiRenderDeliveryDestinationsResponse['meta'];

/**
 * The formats a replace can swap in, by the id preflight takes as the one `outputId`: the
 * contract's outputs, or the parse's delivery comps for a template that authors none.
 */
export type ReplaceFormats = ReadonlyArray<{ id: string; label: string }>;
type Level = PaidCanvasTarget['level'];

const INTEGRATIONS_HREF = '/settings?section=integrations';
export const APPROVAL_COPY =
  'Ad changes wait for approval in Slack and on this page. Nothing changes in Ads Manager until someone approves.';
// ponytail: an id lookup pages the account's ads (paused + active) 50 at a time, capped here;
// add a by-id route on the paid targets service when an account outgrows it.
const AD_LOOKUP_PAGES = 10;

/** The formats a row could render — its own pick, else every published format. */
export function formatChoices(row: RenderPreflightRow, outputs: ReplaceFormats): string[] {
  return row.outputIds.length ? row.outputIds : outputs.map((output) => output.id);
}

/** The one format a replacing row renders, or null while it has not been narrowed to one. */
export function replaceOutputId(
  row: RenderPreflightRow,
  outputs: ReplaceFormats,
  formatByRow: Record<string, string>,
): string | null {
  const choices = formatChoices(row, outputs);
  const chosen = formatByRow[row.rowId];
  if (chosen && choices.includes(chosen)) return chosen;
  return choices.length === 1 ? (choices[0] ?? null) : null;
}

/** A spreadsheet hands over `{action:'replace', adId}`; until names resolve it is not a target. */
export function isUnresolvedTarget(delivery: ApiRenderDeliveryTarget): boolean {
  return (
    delivery.action === 'replace' &&
    (!delivery.adAccountId || !delivery.campaignId || !delivery.adsetId || !delivery.adName)
  );
}

/** What keeps the Deliver step from moving on, in words a person can act on. */
export function metaDeliveryProblems(
  rows: RenderPreflightRow[],
  outputs: ReplaceFormats,
  formatByRow: Record<string, string>,
  meta: MetaPickerState,
): string[] {
  const targeted = rows.filter((row) => row.delivery);
  if (!targeted.length) return [];
  if (meta === 'loading') return ['Checking for an ad account…'];
  if (meta !== 'unknown' && !meta.connected) {
    return ['Clear the ad targets — this brand has no ad account connected.'];
  }
  const problems: string[] = [];
  const unresolved = targeted.filter((row) => row.delivery && isUnresolvedTarget(row.delivery));
  if (unresolved.length) {
    problems.push(`Resolve ${unresolved.length} ad ID${unresolved.length === 1 ? '' : 's'}.`);
  }
  const unformatted = targeted.filter(
    (row) =>
      row.delivery?.action === 'replace' && replaceOutputId(row, outputs, formatByRow) === null,
  );
  if (unformatted.length) problems.push('Choose one format for each ad replacement.');
  return problems;
}

/** A picked or looked-up ad as a replace target, or null when Meta left out its ad set. */
export function replaceTargetFor(
  adAccountId: string,
  ad: PaidCanvasTarget,
): ApiRenderDeliveryTarget | null {
  if (!ad.campaignId || !ad.adsetId) return null;
  return {
    action: 'replace',
    adAccountId,
    campaignId: ad.campaignId,
    ...(ad.campaignName ? { campaignName: ad.campaignName } : {}),
    adsetId: ad.adsetId,
    ...(ad.adsetName ? { adsetName: ad.adsetName } : {}),
    adId: ad.id,
    adName: ad.name || ad.id,
    ...(ad.status === 'PAUSED' || ad.status === 'ACTIVE' ? { adStatus: ad.status } : {}),
    ...(ad.creativeId ? { expectedCreativeId: ad.creativeId } : {}),
  };
}

export type AdIdLine = { line: number; rowId: string; adId: string };

/**
 * `row label<TAB>ad id` lines go to the row with that label; bare ids go to rows in order.
 * Line numbers are 1-based over the pasted text so an error points at what the person typed.
 */
export function parseAdIdLines(
  text: string,
  rows: Pick<RenderPreflightRow, 'rowId' | 'label' | 'labelPath'>[],
): { assignments: AdIdLine[]; errors: { line: number; message: string }[] } {
  const assignments: AdIdLine[] = [];
  const errors: { line: number; message: string }[] = [];
  const norm = (value: string) => value.trim().toLowerCase();
  let nextBare = 0;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    if (raw.includes('\t')) {
      const [label = '', adId = ''] = raw.split('\t').map((cell) => cell.trim());
      const row = rows.find(
        (item) =>
          norm(item.label) === norm(label) || norm(item.labelPath.join(' / ')) === norm(label),
      );
      if (!adId) errors.push({ line, message: 'no ad ID after the tab' });
      else if (!row) errors.push({ line, message: `no row named “${label}”` });
      else assignments.push({ line, rowId: row.rowId, adId });
      return;
    }
    const row = rows[nextBare];
    nextBare += 1;
    if (!row) errors.push({ line, message: `more ad IDs than rows (${rows.length})` });
    else assignments.push({ line, rowId: row.rowId, adId: raw.trim() });
  });
  return { assignments, errors };
}

/** Looks ad ids up among one brand account's paused and active ads — the assigned one if unnamed. */
export async function findAds(
  brandId: string,
  adIds: string[],
  adAccountId?: string,
): Promise<{ adAccountId: string | null; ads: Map<string, PaidCanvasTarget> }> {
  const wanted = new Set(adIds);
  const ads = new Map<string, PaidCanvasTarget>();
  let answeredAccount: string | null = null;
  let cursor: string | undefined;
  for (let page = 0; page < AD_LOOKUP_PAGES && ads.size < wanted.size; page += 1) {
    const result = await publishingApi.searchPaid({
      brandId,
      ...(adAccountId ? { adAccountId } : {}),
      level: 'ad',
      limit: 50,
      cursor,
    });
    answeredAccount = result.adAccountId;
    for (const item of result.items) if (wanted.has(item.id)) ads.set(item.id, item);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return { adAccountId: answeredAccount, ads };
}

const describePaidFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('meta_ad_account_not_found'))
    return 'No ad account is connected to this brand.';
  if (message.includes('ad_account_not_assigned_to_brand'))
    return 'That ad account is not linked to this brand.';
  return message || 'Meta did not answer. Try again.';
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Badge variant="success">Active</Badge>;
  if (status === 'PAUSED') return <Badge variant="muted">Paused</Badge>;
  return <Badge variant="outline">{status.toLowerCase()}</Badge>;
}

export function DeliveryTargetPicker({
  brandId,
  meta,
  rows,
  outputs,
  formatByRow,
  onDeliveryChange,
  onFormatChange,
}: {
  brandId: string;
  meta: MetaPickerState;
  rows: RenderPreflightRow[];
  outputs: ReplaceFormats;
  formatByRow: Record<string, string>;
  onDeliveryChange: (rowId: string, delivery: ApiRenderDeliveryTarget | null) => void;
  onFormatChange: (rowId: string, outputId: string) => void;
}) {
  const connected = meta !== 'loading' && (meta === 'unknown' || meta.connected);
  const known = meta !== 'loading' && meta !== 'unknown' ? meta : null;
  // Where ads are looked for. Rows keep the account their own target names; this is only the
  // account the next pick searches.
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const adAccountId = pickedAccount ?? known?.adAccountId ?? undefined;
  const accounts = known?.adAccounts ?? [];
  const [resolveErrors, setResolveErrors] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);
  // The caller hands a fresh arrow every render; the lookup must not restart on each one.
  const deliveryChange = useRef(onDeliveryChange);
  deliveryChange.current = onDeliveryChange;

  // Spreadsheet targets carry an ad id and nothing else. Look them up once per id; a miss stays
  // on the row as an inline error until the person picks another ad or removes the target.
  const pendingKey = JSON.stringify(
    rows.flatMap((row) =>
      row.delivery?.action === 'replace' &&
      isUnresolvedTarget(row.delivery) &&
      !resolveErrors[`${row.rowId}:${row.delivery.adId}`]
        ? [[row.rowId, row.delivery.adId]]
        : [],
    ),
  );
  useEffect(() => {
    const pending = JSON.parse(pendingKey) as [string, string][];
    if (!connected || !pending.length) return;
    let cancelled = false;
    setResolving(true);
    findAds(
      brandId,
      pending.map(([, adId]) => adId),
      adAccountId,
    )
      .then(({ adAccountId, ads }) => {
        if (cancelled) return;
        const misses: Record<string, string> = {};
        for (const [rowId, adId] of pending) {
          const ad = ads.get(adId);
          const target = ad && adAccountId ? replaceTargetFor(adAccountId, ad) : null;
          if (target) deliveryChange.current(rowId, target);
          else
            misses[`${rowId}:${adId}`] = `Ad ${adId} isn’t a paused or active ad in this account.`;
        }
        setResolveErrors((current) => ({ ...current, ...misses }));
      })
      .catch((error) => {
        if (cancelled) return;
        const message = describePaidFailure(error);
        setResolveErrors((current) => ({
          ...current,
          ...Object.fromEntries(pending.map(([rowId, adId]) => [`${rowId}:${adId}`, message])),
        }));
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, connected, pendingKey, adAccountId]);

  if (meta === 'loading') {
    return <p className="text-xs text-muted-foreground">Checking for an ad account…</p>;
  }

  const targeted = rows.filter((row) => row.delivery);
  if (!connected) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-dashed px-3 py-3 text-xs">
          <p className="font-medium">No ad account connected</p>
          <p className="mt-0.5 text-muted-foreground">
            Connect a Meta ad account to this brand to replace ads from here. These renders still go
            to the Library.{' '}
            <Link
              href={INTEGRATIONS_HREF}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Open integrations
            </Link>
          </p>
        </div>
        {targeted.length ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {targeted.length} row{targeted.length === 1 ? ' asks' : 's ask'} to replace an ad.
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                for (const row of targeted) onDeliveryChange(row.rowId, null);
              }}
            >
              Clear ad targets
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const formatLabel = (id: string) => outputs.find((output) => output.id === id)?.label ?? id;
  return (
    <div className="space-y-2">
      {accounts.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Ad account</span>
          <Select value={adAccountId} onValueChange={(next) => setPickedAccount(next)}>
            <SelectTrigger aria-label="Ad account" size="sm" className="w-auto text-xs">
              <SelectValue
                items={Object.fromEntries(
                  accounts.map((account) => [account.id, account.name ?? account.id]),
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name ?? account.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {accounts.length <= 1 && known && (known.adAccountName || known.adAccountId)
          ? `Ad account: ${known.adAccountName ?? known.adAccountId}. `
          : ''}
        {APPROVAL_COPY}
      </p>
      <ul className="divide-y rounded-md border text-xs">
        {rows.map((row) => (
          <MetaRow
            key={row.rowId}
            brandId={brandId}
            adAccountId={adAccountId}
            row={row}
            choices={formatChoices(row, outputs)}
            format={replaceOutputId(row, outputs, formatByRow)}
            formatLabel={formatLabel}
            resolving={resolving}
            resolveError={
              row.delivery?.action === 'replace'
                ? resolveErrors[`${row.rowId}:${row.delivery.adId}`]
                : undefined
            }
            onDeliveryChange={onDeliveryChange}
            onFormatChange={onFormatChange}
          />
        ))}
      </ul>
      <PasteAdIds
        brandId={brandId}
        adAccountId={adAccountId}
        rows={rows}
        onDeliveryChange={onDeliveryChange}
      />
    </div>
  );
}

function MetaRow({
  brandId,
  adAccountId,
  row,
  choices,
  format,
  formatLabel,
  resolving,
  resolveError,
  onDeliveryChange,
  onFormatChange,
}: {
  brandId: string;
  adAccountId: string | undefined;
  row: RenderPreflightRow;
  choices: string[];
  format: string | null;
  formatLabel: (id: string) => string;
  resolving: boolean;
  resolveError: string | undefined;
  onDeliveryChange: (rowId: string, delivery: ApiRenderDeliveryTarget | null) => void;
  onFormatChange: (rowId: string, outputId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const { delivery } = row;
  const name = row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label;
  return (
    <li className="space-y-1.5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={name}>
          {name}
        </span>
        {delivery?.action === 'replace' ? (
          choices.length > 1 ? (
            <Select
              value={format ?? undefined}
              onValueChange={(next) => onFormatChange(row.rowId, next)}
            >
              <SelectTrigger aria-label={`Format for ${name}`} size="sm" className="w-auto text-xs">
                <SelectValue
                  placeholder="Choose one format"
                  items={Object.fromEntries(choices.map((id) => [id, formatLabel(id)]))}
                />
              </SelectTrigger>
              <SelectContent>
                {choices.map((id) => (
                  <SelectItem key={id} value={id}>
                    {formatLabel(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : choices.length === 1 ? (
            <span className="text-muted-foreground">{formatLabel(choices[0] ?? '')} only</span>
          ) : (
            <span className="text-destructive">This template has no named format to swap in</span>
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          {!delivery ? (
            <span className="text-muted-foreground">Library only</span>
          ) : delivery.action === 'create' ? (
            <span>
              New paused ad in {delivery.campaignName ?? delivery.campaignId} ›{' '}
              {delivery.adsetName ?? delivery.adsetId}
            </span>
          ) : isUnresolvedTarget(delivery) ? (
            resolveError ? (
              <span className="text-destructive">{resolveError}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                {resolving ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                Looking up ad {delivery.adId}…
              </span>
            )
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">
                {delivery.campaignName ?? delivery.campaignId} ›{' '}
                {delivery.adsetName ?? delivery.adsetId} ›
              </span>
              <span className="font-medium">{delivery.adName ?? delivery.adId}</span>
              {delivery.adStatus ? <StatusBadge status={delivery.adStatus} /> : null}
            </span>
          )}
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          aria-label={`${delivery ? 'Change the ad' : 'Replace an ad'} for ${name}`}
          onClick={() => setPicking((current) => !current)}
        >
          {delivery ? 'Change' : 'Replace an ad'}
        </Button>
        {delivery ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={`Remove the ad target for ${name}`}
            onClick={() => onDeliveryChange(row.rowId, null)}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>
      {picking ? (
        <AdDrillDown
          // A different account is a different tree: start the drill again from its campaigns.
          key={adAccountId}
          brandId={brandId}
          adAccountId={adAccountId}
          onCancel={() => setPicking(false)}
          onPick={(target) => {
            onDeliveryChange(row.rowId, target);
            setPicking(false);
          }}
        />
      ) : null}
    </li>
  );
}

type Crumb = { id: string; name: string };

function AdDrillDown({
  brandId,
  adAccountId,
  onPick,
  onCancel,
}: {
  brandId: string;
  adAccountId: string | undefined;
  onPick: (target: ApiRenderDeliveryTarget) => void;
  onCancel: () => void;
}) {
  const [campaign, setCampaign] = useState<Crumb | null>(null);
  const [adset, setAdset] = useState<Crumb | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<{
    adAccountId: string;
    items: PaidCanvasTarget[];
    nextCursor: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sequence = useRef(0);
  const level: Level = !campaign ? 'campaign' : !adset ? 'adset' : 'ad';
  const parentId = adset?.id ?? campaign?.id;

  const load = async (cursor?: string) => {
    const request = ++sequence.current;
    setLoading(true);
    setProblem(null);
    try {
      const result = await publishingApi.searchPaid({
        brandId,
        ...(adAccountId ? { adAccountId } : {}),
        level,
        parentId,
        query: query.trim() || undefined,
        cursor,
        limit: 20,
      });
      if (request !== sequence.current) return;
      setPage((current) => ({
        adAccountId: result.adAccountId,
        items: cursor && current ? [...current.items, ...result.items] : result.items,
        nextCursor: result.nextCursor,
      }));
    } catch (error) {
      if (request === sequence.current) setProblem(describePaidFailure(error));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const timer = setTimeout(() => void loadRef.current(), 250);
    return () => clearTimeout(timer);
  }, [brandId, level, parentId, query]);

  // A new ad takes every format the row renders, so it needs no format and no ad to pick.
  const createHere = () => {
    if (!page || !campaign || !adset) return;
    onPick({
      action: 'create',
      adAccountId: page.adAccountId,
      campaignId: campaign.id,
      campaignName: campaign.name,
      adsetId: adset.id,
      adsetName: adset.name,
      adStatus: 'PAUSED',
    });
  };

  const pick = (item: PaidCanvasTarget) => {
    setQuery('');
    if (item.level === 'campaign') return setCampaign({ id: item.id, name: item.name || item.id });
    if (item.level === 'adset') return setAdset({ id: item.id, name: item.name || item.id });
    if (!page || !campaign || !adset) return;
    const target = replaceTargetFor(page.adAccountId, {
      ...item,
      campaignId: item.campaignId ?? campaign.id,
      campaignName: item.campaignName ?? campaign.name,
      adsetId: item.adsetId ?? adset.id,
      adsetName: item.adsetName ?? adset.name,
    });
    if (target) onPick(target);
  };

  const noun = level === 'adset' ? 'ad set' : level;
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-1 text-2xs">
        <button
          type="button"
          className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          disabled={!campaign}
          onClick={() => {
            setCampaign(null);
            setAdset(null);
          }}
        >
          Campaigns
        </button>
        {campaign ? (
          <>
            <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
            <button
              type="button"
              className="max-w-40 truncate text-primary hover:underline disabled:text-foreground disabled:no-underline"
              disabled={!adset}
              onClick={() => setAdset(null)}
            >
              {campaign.name}
            </button>
          </>
        ) : null}
        {adset ? (
          <>
            <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
            <span className="max-w-40 truncate">{adset.name}</span>
          </>
        ) : null}
        <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={onCancel}>
          Close
        </Button>
      </div>
      {adset ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="gap-1"
          disabled={!page}
          onClick={createHere}
        >
          <Plus aria-hidden /> New paused ad in this ad set
        </Button>
      ) : null}
      <Input
        className="h-7 text-xs"
        aria-label={`Search ${noun}s`}
        placeholder={`Search ${noun}s`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="max-h-48 overflow-y-auto rounded border bg-background">
        {problem ? <p className="p-2 text-destructive">{problem}</p> : null}
        {page?.items.map((item) => (
          <button
            type="button"
            key={item.id}
            className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left last:border-b-0 hover:bg-muted/60"
            onClick={() => pick(item)}
          >
            {item.level === 'ad' && item.previewUrl ? (
              <img src={item.previewUrl} alt="" className="size-7 rounded-sm object-cover" />
            ) : null}
            <span className="min-w-0 flex-1 truncate font-medium">{item.name || item.id}</span>
            <StatusBadge status={item.status} />
          </button>
        ))}
        {loading ? (
          <p className="flex items-center gap-1.5 p-2 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Loading {noun}s…
          </p>
        ) : null}
        {!loading && !problem && page && page.items.length === 0 ? (
          <p className="p-2 text-muted-foreground">No paused or active {noun}s match.</p>
        ) : null}
      </div>
      {page?.nextCursor && !loading ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => void load(page.nextCursor ?? undefined)}
        >
          More {noun}s
        </Button>
      ) : null}
    </div>
  );
}

function PasteAdIds({
  brandId,
  adAccountId,
  rows,
  onDeliveryChange,
}: {
  brandId: string;
  adAccountId: string | undefined;
  rows: RenderPreflightRow[];
  onDeliveryChange: (rowId: string, delivery: ApiRenderDeliveryTarget | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    matched: number;
    errors: { line: number; message: string }[];
  } | null>(null);

  const apply = async () => {
    const { assignments, errors } = parseAdIdLines(text, rows);
    setBusy(true);
    try {
      const { adAccountId: account, ads } = assignments.length
        ? await findAds(brandId, [...new Set(assignments.map((item) => item.adId))], adAccountId)
        : { adAccountId: null, ads: new Map<string, PaidCanvasTarget>() };
      const lineErrors = [...errors];
      let matched = 0;
      for (const assignment of assignments) {
        const ad = ads.get(assignment.adId);
        const target = ad && account ? replaceTargetFor(account, ad) : null;
        if (!target) {
          lineErrors.push({
            line: assignment.line,
            message: `ad ${assignment.adId} isn’t a paused or active ad in this account`,
          });
          continue;
        }
        onDeliveryChange(assignment.rowId, target);
        matched += 1;
      }
      setResult({ matched, errors: lineErrors.sort((a, b) => a.line - b.line) });
    } catch (error) {
      setResult({ matched: 0, errors: [{ line: 0, message: describePaidFailure(error) }] });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <ClipboardPaste className="size-3.5" aria-hidden /> Paste ad IDs
      </Button>
    );
  }
  return (
    <div className="space-y-1.5 rounded-md border p-2 text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">
          One line per row: <code>row name⇥ad ID</code>, or bare ad IDs in row order (
          {rows.map((row) => row.label).join(', ')}).
        </span>
        <Textarea
          aria-label="Ad IDs"
          rows={4}
          className="font-mono text-xs"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {result ? (
        <div role="status" className="space-y-0.5">
          <p className="text-muted-foreground">
            Matched {result.matched} ad{result.matched === 1 ? '' : 's'}.
          </p>
          {result.errors.map((error) => (
            <p key={`${error.line}:${error.message}`} className="text-destructive">
              {error.line ? `Line ${error.line}: ` : ''}
              {error.message}
            </p>
          ))}
        </div>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!text.trim() || busy}
          onClick={() => void apply()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Apply ad IDs
        </Button>
      </div>
    </div>
  );
}
