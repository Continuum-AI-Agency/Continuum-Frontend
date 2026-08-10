'use client';

// Review-status selector (none/draft/in_review/needs_changes/approved) with
// audit trail. Owned by WS3 (versions + review workflow). Renders as the
// canonical status pill; changing status POSTs a transition (with an optional
// note when moving to needs_changes) and a history popover answers "who
// approved what, when".

import type { AssetReviewEvent, MediaAsset, MediaReviewStatus } from '@continuum/contracts';
import { ChevronDown, History, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { listReviewEvents, transitionReviewStatus } from '@/lib/library/review';
import {
  normalizeReviewStatus,
  REVIEW_STATUS_META,
  REVIEW_STATUS_ORDER,
} from '@/lib/library/reviewStatus';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

const HISTORY_DISPLAY_LIMIT = 8;

export type ReviewStatusControlProps = {
  brandId: string;
  asset: MediaAsset;
  onChanged?: () => void;
};

function StatusDot({ status }: { status: MediaReviewStatus }) {
  const meta = REVIEW_STATUS_META[status];
  if (meta.indicator) return <PillIndicator variant={meta.indicator} />;
  return <span className={cn('inline-flex size-2 rounded-full', meta.dotClass)} />;
}

function HistoryList({ events }: { events: AssetReviewEvent[] | null }) {
  if (events === null) {
    return <p className="py-2 text-xs text-muted-foreground">Loading history…</p>;
  }
  if (events.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No review activity yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {events.slice(0, HISTORY_DISPLAY_LIMIT).map((event) => (
        <li key={event.id} className="text-xs">
          <span className="font-medium">{REVIEW_STATUS_META[event.toStatus].label}</span>
          <span className="text-muted-foreground">
            {' '}
            by {event.actorName ?? 'a teammate'} · {formatRelativeTime(event.createdAt)}
          </span>
          {event.note ? (
            <p className="mt-0.5 text-muted-foreground italic">“{event.note}”</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ReviewStatusControl({ brandId, asset, onChanged }: ReviewStatusControlProps) {
  const [status, setStatus] = useState(() => normalizeReviewStatus(asset.reviewStatus));
  const [saving, setSaving] = useState(false);
  const [noteTarget, setNoteTarget] = useState<MediaReviewStatus | null>(null);
  const [note, setNote] = useState('');
  const [events, setEvents] = useState<AssetReviewEvent[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setStatus(normalizeReviewStatus(asset.reviewStatus));
    setEvents(null);
  }, [asset]);

  const applyTransition = async (toStatus: MediaReviewStatus, transitionNote?: string) => {
    setSaving(true);
    try {
      const result = await transitionReviewStatus({
        brandId,
        assetId: asset.id,
        toStatus,
        note: transitionNote,
      });
      setStatus(result.reviewStatus);
      setEvents(null);
      onChanged?.();
    } catch (err) {
      toast.error(`Status change failed · ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (toStatus: MediaReviewStatus) => {
    if (toStatus === status) return;
    if (toStatus === 'needs_changes') {
      setNote('');
      setNoteTarget(toStatus);
      return;
    }
    void applyTransition(toStatus);
  };

  const submitNoteDialog = () => {
    const target = noteTarget;
    setNoteTarget(null);
    if (!target) return;
    const trimmed = note.trim();
    void applyTransition(target, trimmed.length > 0 ? trimmed : undefined);
  };

  const handleHistoryOpenChange = (open: boolean) => {
    setHistoryOpen(open);
    if (open && events === null) {
      listReviewEvents({ brandId, assetId: asset.id })
        .then(setEvents)
        .catch((err: unknown) => {
          setEvents([]);
          toast.error(`Loading review history failed · ${(err as Error).message}`);
        });
    }
  };

  const meta = REVIEW_STATUS_META[status];

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={saving}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              aria-label={`Review status: ${meta.label}`}
            >
              <Pill variant="secondary" className="cursor-pointer select-none">
                {saving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <StatusDot status={status} />
                )}
                {meta.label}
                <ChevronDown className="size-3 text-muted-foreground" />
              </Pill>
            </button>
          }
        />
        <DropdownMenuContent align="start">
          {REVIEW_STATUS_ORDER.map((candidate) => (
            <DropdownMenuItem
              key={candidate}
              disabled={candidate === status}
              onSelect={() => handleSelect(candidate)}
              className="gap-2 text-xs"
            >
              <StatusDot status={candidate} />
              {REVIEW_STATUS_META[candidate].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={historyOpen} onOpenChange={handleHistoryOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground"
              aria-label="Review history"
            >
              <History className="size-3.5" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 p-3">
          <p className="mb-1 font-medium text-xs">Review history</p>
          <HistoryList events={events} />
        </PopoverContent>
      </Popover>

      <Dialog
        open={noteTarget !== null}
        onOpenChange={(open) => (!open ? setNoteTarget(null) : undefined)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Request changes</DialogTitle>
            <DialogDescription className="text-xs">
              Add an optional note explaining what needs to change.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Logo is off-brand — use the dark variant."
            rows={3}
            maxLength={2000}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNoteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={submitNoteDialog}>
              Move to Needs changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
