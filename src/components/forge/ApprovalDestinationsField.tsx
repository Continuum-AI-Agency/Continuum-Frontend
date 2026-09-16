'use client';

import type { RenderApprovalDestination } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Hash, MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  approvalDestinationsKey,
  DestinationApproversPanel,
} from '@/components/forge/DestinationApproversPanel';
import { FORGE_STALE_MS } from '@/components/forge/queryKeys';
import { Button } from '@/components/ui/button';
import { fetchApprovalDestinations } from '@/lib/library/renderApprovals';
import { cn } from '@/lib/utils';

// The rooms a Meta-bound render is sent to for approval: the brand's Slack channels and WhatsApp
// groups. Every chosen room gets the whole package; the first active approver to decide a
// variation, in any of them or on the Forge page, wins. A room with nobody who can approve still
// receives the package — its header is where someone asks — so zero is a warning, not a refusal.

const PLATFORM_LABEL: Record<RenderApprovalDestination['platform'], string> = {
  slack: 'Slack',
  whatsapp: 'WhatsApp',
};

/** `#channel` for Slack, the group name for WhatsApp. */
export const approvalRoomName = (destination: RenderApprovalDestination) =>
  destination.platform === 'slack' ? `#${destination.name}` : destination.name;

const approverCount = (count: number) =>
  count ? `${count} approver${count === 1 ? '' : 's'}` : 'no approvers yet';

export function ApprovalDestinationsField({
  brandId,
  value,
  onChange,
}: {
  brandId: string;
  value: string[];
  onChange: (destinationIds: string[]) => void;
}) {
  const [managing, setManaging] = useState<string | null>(null);
  const query = useQuery({
    queryKey: approvalDestinationsKey(brandId),
    queryFn: () => fetchApprovalDestinations(brandId),
    staleTime: FORGE_STALE_MS.active,
    retry: false,
  });

  // Where this brand last asked, pre-selected once. Guarded by a ref rather than by `value.length`
  // so that clearing every box stays cleared — a re-seed there would argue with the person.
  const seeded = useRef(false);
  const defaults = query.data?.defaultDestinationIds;
  useEffect(() => {
    if (seeded.current || !defaults?.length || value.length > 0) return;
    seeded.current = true;
    onChange(defaults);
  }, [defaults, value.length, onChange]);

  if (query.isPending) {
    return <p className="text-xs text-muted-foreground">Loading approval rooms…</p>;
  }
  if (query.isError) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn’t load approval rooms: {query.error.message}
      </p>
    );
  }
  const destinations = query.data.destinations;
  if (!destinations.length) {
    return (
      <p className="text-xs text-muted-foreground">
        This brand has no approval room yet. Slack rooms are the brand’s Slack channels — add one
        under Slack. WhatsApp groups are added by a Continuum operator.
      </p>
    );
  }

  const unstaffed = destinations.filter(
    (destination) => value.includes(destination.id) && destination.activeApprovers === 0,
  );
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Ask for approval in</p>
      <ul aria-label="Approval rooms" className="flex flex-col gap-1">
        {destinations.map((destination) => {
          const name = approvalRoomName(destination);
          const Icon = destination.platform === 'slack' ? Hash : MessageCircle;
          const open = managing === destination.id;
          return (
            <li key={destination.id} className="flex flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={value.includes(destination.id)}
                    onChange={() => toggle(destination.id)}
                  />
                  <Icon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-label={PLATFORM_LABEL[destination.platform]}
                  />
                  <span className="truncate">{name}</span>
                </label>
                <span
                  className={cn(
                    'shrink-0',
                    destination.activeApprovers ? 'text-muted-foreground' : 'text-warning',
                  )}
                >
                  {approverCount(destination.activeApprovers)}
                  {destination.requestedApprovers
                    ? ` · ${destination.requestedApprovers} asking`
                    : ''}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-expanded={open}
                  aria-label={`Manage approvers for ${name}`}
                  onClick={() => setManaging(open ? null : destination.id)}
                >
                  Manage approvers
                </Button>
              </div>
              {open ? (
                <DestinationApproversPanel brandId={brandId} destination={destination} />
              ) : null}
            </li>
          );
        })}
      </ul>
      {unstaffed.length ? (
        <p role="status" className="text-xs text-warning">
          Nobody can approve in {unstaffed.map(approvalRoomName).join(', ')} yet. The package still
          goes there; someone must ask for access and be activated before it can be decided.
        </p>
      ) : null}
    </div>
  );
}
