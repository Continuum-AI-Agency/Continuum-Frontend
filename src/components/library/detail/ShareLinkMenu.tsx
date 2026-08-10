'use client';

// Create/copy/revoke view-only share links for an asset. Owned by WS4
// (AEP/file upload + share links). Links resolve at /share/[token] with no
// account; media.share_links is deny-all RLS, so all traffic goes through
// /api/library/share via the typed fetchers in @/lib/library/share.

import type { MediaAsset, ShareLink, ShareVersionMode } from '@continuum/contracts';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createShareLink, listShareLinks, revokeShareLink } from '@/lib/library/share';
import { shareLinkStatus } from '@/lib/library/shareValidation';

export type ShareLinkMenuProps = {
  brandId: string;
  asset: MediaAsset;
};

const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'No expiry' },
] as const;

function shareUrl(link: ShareLink): string {
  return link.url ?? `${window.location.origin}/share/${link.token}`;
}

function linkLabel(link: ShareLink): string {
  const status = shareLinkStatus({ revokedAt: link.revokedAt, expiresAt: link.expiresAt });
  if (!status.active) return status.reason === 'revoked' ? 'Revoked' : 'Expired';
  if (!link.expiresAt) return 'No expiry';
  return `Expires ${new Date(link.expiresAt).toLocaleDateString()}`;
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await listShareLinks(brandId, asset.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load share links');
    } finally {
      setLoading(false);
    }
  }, [brandId, asset.id]);

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
      setError(err instanceof Error ? err.message : 'Could not create the share link');
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
  ]);

  const handleCopy = useCallback(async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(shareUrl(link));
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
    } catch {
      setError('Could not copy the link');
    }
  }, []);

  const handleRevoke = useCallback(
    async (link: ShareLink) => {
      setError(null);
      try {
        const revoked = await revokeShareLink({ brandId, shareLinkId: link.id });
        setLinks((prev) => prev.map((l) => (l.id === revoked.id ? revoked : l)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not revoke the link');
      }
    },
    [brandId],
  );

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Link2 className="size-3.5" aria-hidden />
            Share
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
              <SelectValue placeholder="Versions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">Live latest</SelectItem>
              <SelectItem value="pinned">Current version</SelectItem>
              <SelectItem value="all">All versions</SelectItem>
            </SelectContent>
          </Select>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Expiry" />
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
          <PolicyToggle label="Comments" checked={allowComments} onChange={setAllowComments} />
          <PolicyToggle label="Approval" checked={allowApproval} onChange={setAllowApproval} />
          <PolicyToggle label="Downloads" checked={allowDownload} onChange={setAllowDownload} />
          <PolicyToggle label="Metadata" checked={showMetadata} onChange={setShowMetadata} />
          <PolicyToggle
            label="Require identity"
            checked={requireIdentity}
            onChange={setRequireIdentity}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Optional passcode"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={
              creating || ((versionMode === 'pinned' || allowApproval) && !asset.headVersionId)
            }
          >
            {creating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Create link
          </Button>
        </div>

        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

        <div className="mt-3 flex flex-col gap-1">
          {loading ? (
            <p className="py-2 text-xs text-muted-foreground">Loading links…</p>
          ) : links.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No links yet. Anyone with a link can view this asset without an account.
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
                    {linkLabel(link)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {active ? (
                      <>
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
                          {copiedId === link.id ? 'Copied' : 'Copy'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => void handleRevoke(link)}
                        >
                          Revoke
                        </Button>
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
