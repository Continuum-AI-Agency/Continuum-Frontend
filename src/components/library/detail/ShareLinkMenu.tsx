'use client';

// Create/copy/revoke view-only share links for an asset, customize how each
// one presents (layout, order, branding, watermark, guest-editable field), and
// see what external reviewers did with this asset across its links. Links
// resolve at /share/[token] with no account.

import type {
  MediaAsset,
  ShareLink,
  ShareLinkActivityResponse,
  ShareVersionMode,
} from '@continuum/contracts';
import { Check, Copy, Link2, Loader2, SlidersHorizontal } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useState, useMemo as useUiConfigMemo } from 'react';
import { ShareLinkActivity } from '@/components/library/share/ShareLinkActivity';
import { ShareLinkPanel } from '@/components/library/share/ShareLinkPanel';
import { fetchAssetShareActivity } from '@/components/library/share/shareLinkClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
import { createShareLink, listShareLinks, revokeShareLink } from '@/lib/library/share';
import { shareLinkStatus } from '@/lib/library/shareValidation';

export type ShareLinkMenuProps = {
  brandId: string;
  asset: MediaAsset;
};

function useLocalExpiryOptionsMessages() {
  const translateConfig = useUiTranslations('library');
  return useUiConfigMemo(() => {
    const value = [
      { value: '7', label: translateConfig('7_days_7f920bb6') },
      { value: '30', label: translateConfig('30_days_ffd72805') },
      { value: '90', label: translateConfig('90_days_38825b0f') },
      { value: 'never', label: translateConfig('no_expiry_fe06351d') },
    ] as const;
    return value;
  }, [translateConfig]);
}

function shareUrl(link: ShareLink): string {
  return link.url ?? `${window.location.origin}/share/${link.token}`;
}

function linkLabel(
  link: ShareLink,
  t: ReturnType<typeof useUiTranslations<'library'>>,
  locale: UiLocale,
): string {
  const status = shareLinkStatus({ revokedAt: link.revokedAt, expiresAt: link.expiresAt });
  if (!status.active) return t(status.reason === 'revoked' ? 'shareRevoked' : 'shareExpired');
  if (!link.expiresAt) return t('shareNoExpiry');
  return t('shareExpires', { date: new Date(link.expiresAt).toLocaleDateString(locale) });
}

function PolicyToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 rounded border-border"
      />
      {label}
    </label>
  );
}

export function ShareLinkMenu({ brandId, asset }: ShareLinkMenuProps) {
  const EXPIRY_OPTIONS = useLocalExpiryOptionsMessages();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');
  const currentUiLocale = useUiLocale();

  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expiry, setExpiry] = useState<string>('30');
  const [versionMode, setVersionMode] = useState<ShareVersionMode>('live');
  const [allowComments, setAllowComments] = useState(true);
  const [allowApproval, setAllowApproval] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [showMetadata, setShowMetadata] = useState(true);
  const [requireIdentity, setRequireIdentity] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ShareLinkActivityResponse>({ events: [] });
  const [customizingId, setCustomizingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextLinks, nextActivity] = await Promise.all([
        listShareLinks(brandId, asset.id),
        fetchAssetShareActivity(brandId, asset.id).catch(() => ({ events: [] })),
      ]);
      setLinks(nextLinks);
      setActivity(nextActivity);
    } catch (err) {
      setError(uiErrorText(err));
    } finally {
      setLoading(false);
    }
  }, [brandId, asset.id, translateUi, uiErrorText]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) void refresh();
    },
    [refresh],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const link = await createShareLink({
        brandId,
        scope: 'asset',
        assetId: asset.id,
        versionMode: allowApproval ? 'pinned' : versionMode,
        ...((versionMode === 'pinned' || allowApproval) && asset.headVersionId
          ? { pinnedVersionId: asset.headVersionId }
          : {}),
        allowComments,
        allowApproval,
        allowDownload,
        showMetadata,
        showCustomFields: false,
        requireIdentity,
        ...(passcode.trim() ? { passcode: passcode.trim() } : {}),
        ...(expiry === 'never' ? {} : { expiresInDays: Number(expiry) }),
      });
      setLinks((prev) => [link, ...prev]);
      await navigator.clipboard.writeText(shareUrl(link)).catch(() => undefined);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
    } catch (err) {
      setError(uiErrorText(err));
    } finally {
      setCreating(false);
    }
  }, [
    brandId,
    asset.id,
    asset.headVersionId,
    expiry,
    versionMode,
    allowComments,
    allowApproval,
    allowDownload,
    showMetadata,
    requireIdentity,
    passcode,
    translateUi,
    uiErrorText,
  ]);

  const handleCopy = useCallback(
    async (link: ShareLink) => {
      try {
        await navigator.clipboard.writeText(shareUrl(link));
        setCopiedId(link.id);
        setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
      } catch {
        setError(translateUi('could_not_copy_the_link_b156f6c7'));
      }
    },
    [translateUi],
  );

  const handleRevoke = useCallback(
    async (link: ShareLink) => {
      setError(null);
      try {
        const revoked = await revokeShareLink({ brandId, shareLinkId: link.id });
        setLinks((prev) => prev.map((l) => (l.id === revoked.id ? revoked : l)));
      } catch (err) {
        setError(uiErrorText(err));
      }
    },
    [brandId, translateUi, uiErrorText],
  );

  return (
    <>
      <Popover onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm">
              <Link2 className="size-3.5" aria-hidden /> {translateUi('share_29887a5f')}{' '}
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={allowApproval ? 'pinned' : versionMode}
              onValueChange={(value: ShareVersionMode) => setVersionMode(value)}
              disabled={allowApproval}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={translateUi('versions_f89ea270')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">{translateUi('live_latest_9004dc73')}</SelectItem>
                <SelectItem value="pinned">{translateUi('current_version_a74487de')}</SelectItem>
                <SelectItem value="all">{translateUi('all_versions_6473ccf9')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={translateUi('expiry_6956d814')} />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <PolicyToggle
              label={translateUi('comments_355f79f2')}
              checked={allowComments}
              onChange={setAllowComments}
            />
            <PolicyToggle
              label={translateUi('approval_147fb813')}
              checked={allowApproval}
              onChange={setAllowApproval}
            />
            <PolicyToggle
              label={translateUi('downloads_d5fdc1af')}
              checked={allowDownload}
              onChange={setAllowDownload}
            />
            <PolicyToggle
              label={translateUi('metadata_9eddf573')}
              checked={showMetadata}
              onChange={setShowMetadata}
            />
            <PolicyToggle
              label={translateUi('require_identity_ef33398a')}
              checked={requireIdentity}
              onChange={setRequireIdentity}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder={translateUi('optional_passcode_5ae60488')}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              onClick={() => void handleCreate()}
              disabled={
                creating || ((versionMode === 'pinned' || allowApproval) && !asset.headVersionId)
              }
            >
              {creating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}{' '}
              {translateUi('create_link_e6b850cf')}{' '}
            </Button>
          </div>

          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

          <div className="mt-3 flex flex-col gap-1">
            {loading ? (
              <p className="py-2 text-xs text-muted-foreground">
                {translateUi('loading_links_8662575b')}
              </p>
            ) : links.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                {' '}
                {translateUi('no_links_yet_anyone_with_a_link_can_8fb435fd')}{' '}
              </p>
            ) : (
              links.map((link) => {
                const active = shareLinkStatus({
                  revokedAt: link.revokedAt,
                  expiresAt: link.expiresAt,
                }).active;
                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                  >
                    <span
                      className={`truncate text-xs ${active ? 'text-foreground' : 'text-muted-foreground line-through'}`}
                    >
                      {linkLabel(link, translateUi, currentUiLocale)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {active ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            aria-label={translateUi('customize_link_6913cb7a')}
                            data-share-customize={link.id}
                            onClick={() => setCustomizingId(link.id)}
                          >
                            <SlidersHorizontal className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => void handleCopy(link)}
                          >
                            {copiedId === link.id ? (
                              <Check className="size-3.5" aria-hidden />
                            ) : (
                              <Copy className="size-3.5" aria-hidden />
                            )}
                            {copiedId === link.id
                              ? translateUi('copied_8d525e5f')
                              : translateUi('copy_e21f935f')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => void handleRevoke(link)}
                          >
                            {' '}
                            {translateUi('revoke_87e6d00b')}{' '}
                          </Button>
                        </>
                      ) : null}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="text-xs font-semibold text-foreground">
              {' '}
              {translateUi('reviewer_activity_on_this_asset_19c12b55')}{' '}
            </h3>
            <ShareLinkActivity
              events={activity.events}
              totals={activity.totals}
              emptyLabel={translateUi('shareNoReviewerOpened')}
            />
          </div>
        </PopoverContent>
      </Popover>
      <Dialog
        open={customizingId !== null}
        onOpenChange={(open) => !open && setCustomizingId(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{translateUi('customize_share_link_e07be3a6')}</DialogTitle>
            <DialogDescription>
              {' '}
              {translateUi('how_reviewers_see_this_link_and_wha_34a9fcc1')}{' '}
            </DialogDescription>
          </DialogHeader>
          {customizingId ? <ShareLinkPanel by={{ id: customizingId }} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
