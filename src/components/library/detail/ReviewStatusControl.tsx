'use client';

// Review-status selector (none/draft/in_review/needs_changes/approved, plus the
// brand's custom states within them) with audit trail. Renders as the canonical
// status pill in the brand's own label and colour (media.review_state_labels,
// media.review_custom_states). A base status on the head posts a transition; a
// custom state, or any state on an older version, goes through the library-review
// edge function (a decision on an older cut stays on that cut). A needs_changes
// move asks for an optional note, and a history popover answers "who approved
// what, when" — for this asset, or brand-wide as a CSV report.

import type {
  AssetReviewEvent,
  MediaAsset,
  MediaReviewStatus,
  ReviewCustomState,
  ReviewStateLabel,
  VersionReviewState,
} from '@continuum/contracts';
import { ChevronDown, Download, History, Loader2, Palette } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast-imperative';
import {
  approvalReportHref,
  listReviewEvents,
  setAssetReviewState,
  transitionReviewStatus,
} from '@/lib/library/review';
import { normalizeReviewStatus, REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { ReviewStateLabelsEditor } from '../review/ReviewStateLabelsEditor';
import { reviewDisplay } from '../review/reviewDisplay';
import { useReviewCustomStates, useReviewStateLabels } from '../review/useReviewStateLabels';

const HISTORY_DISPLAY_LIMIT = 8;

export type ReviewStatusControlProps = {
  brandId: string;
  asset: MediaAsset;
  /** The older version on stage; null/absent = the head. */
  version?: { id: string; versionNumber: number } | null;
  onChanged?: () => void;
};

type Labels = Record<MediaReviewStatus, ReviewStateLabel>;
type Target = { status: MediaReviewStatus; stateId: string | null };

function StatusDot({ label }: { label: { color: string } }) {
  return (
    <span
      data-status-color={label.color}
      className="inline-flex size-2 shrink-0 rounded-full"
      style={{ backgroundColor: label.color }}
    />
  );
}

function HistoryList({
  events,
  labels,
  customStates,
}: {
  events: AssetReviewEvent[] | null;
  labels: Labels;
  customStates: ReviewCustomState[];
}) {
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
          <span className="font-medium">
            {reviewDisplay(event.toStatus, event.toStateId, labels, customStates).label}
          </span>
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

export function ReviewStatusControl({
  brandId,
  asset,
  version = null,
  onChanged,
}: ReviewStatusControlProps) {
  const headTarget = (): Target => ({
    status: normalizeReviewStatus(asset.reviewStatus),
    stateId: asset.reviewStateId ?? null,
  });
  const [current, setCurrent] = useState<Target>(headTarget);
  const [saving, setSaving] = useState(false);
  const [noteTarget, setNoteTarget] = useState<Target | null>(null);
  const [note, setNote] = useState('');
  const [events, setEvents] = useState<AssetReviewEvent[] | null>(null);
  const [versionStates, setVersionStates] = useState<VersionReviewState[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const labels = useReviewStateLabels(brandId);
  const customStates = useReviewCustomStates(brandId);
  const versionId = version?.id ?? null;

  // Only the newest read may land: a read started before a write can resolve after
  // the one started by it, and would put the pre-write state back on the pill.
  const historyRead = useRef(0);
  const loadHistory = useCallback(() => {
    const read = ++historyRead.current;
    return listReviewEvents({ brandId, assetId: asset.id })
      .then((history) => {
        if (read !== historyRead.current) return;
        setEvents(history.events);
        setVersionStates(history.versions ?? []);
      })
      .catch((err: unknown) => {
        if (read !== historyRead.current) return;
        setEvents([]);
        setVersionStates([]);
        toast.error(`Loading review history failed · ${(err as Error).message}`);
      });
  }, [brandId, asset.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: headTarget reads only `asset`, which is listed
  useEffect(() => {
    setCurrent(headTarget());
    setEvents(null);
  }, [asset]);

  // Another asset's version states never carry over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: asset.id is the reset trigger
  useEffect(() => {
    historyRead.current += 1;
    setVersionStates(null);
  }, [asset.id]);

  // An older version shows its own decided state, read with the history and
  // re-read when the asset refreshes. The last known state stays on the pill
  // while the re-read is in flight, so a refresh never flashes "None".
  // biome-ignore lint/correctness/useExhaustiveDependencies: `asset` is the refresh trigger
  useEffect(() => {
    if (versionId) void loadHistory();
  }, [versionId, loadHistory, asset]);

  const versionState = versionId
    ? versionStates?.find((state) => state.versionId === versionId)
    : undefined;
  const shown: Target = versionId
    ? { status: versionState?.reviewStatus ?? 'none', stateId: versionState?.reviewStateId ?? null }
    : current;
  const display = reviewDisplay(shown.status, shown.stateId, labels, customStates);

  const applyTarget = async (target: Target, transitionNote?: string) => {
    setSaving(true);
    try {
      if (!versionId && !target.stateId) {
        const result = await transitionReviewStatus({
          brandId,
          assetId: asset.id,
          toStatus: target.status,
          note: transitionNote,
        });
        setCurrent({ status: result.reviewStatus, stateId: null });
      } else {
        const result = await setAssetReviewState({
          brandId,
          assetId: asset.id,
          ...(versionId ? { versionId } : {}),
          ...(target.stateId ? { stateId: target.stateId } : { toStatus: target.status }),
          ...(transitionNote ? { note: transitionNote } : {}),
        });
        if (result.isHead) {
          setCurrent({ status: result.reviewStatus, stateId: result.reviewStateId });
        } else {
          // The write's own answer is the version's state now; a read already in
          // flight is stale and is dropped.
          historyRead.current += 1;
          const decided = {
            versionId: result.versionId,
            versionNumber: version?.versionNumber ?? 1,
            isHead: false,
            reviewStatus: result.reviewStatus,
            reviewStateId: result.reviewStateId,
          };
          setVersionStates((prev) => [
            ...(prev ?? []).filter((state) => state.versionId !== result.versionId),
            decided,
          ]);
        }
      }
      setEvents(null);
      if (versionId) await loadHistory();
      onChanged?.();
    } catch (err) {
      toast.error(`Status change failed · ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (target: Target) => {
    if (target.status === shown.status && target.stateId === shown.stateId) return;
    if (target.status === 'needs_changes') {
      setNote('');
      setNoteTarget(target);
      return;
    }
    void applyTarget(target);
  };

  const submitNoteDialog = () => {
    const target = noteTarget;
    setNoteTarget(null);
    if (!target) return;
    const trimmed = note.trim();
    void applyTarget(target, trimmed.length > 0 ? trimmed : undefined);
  };

  const handleHistoryOpenChange = (open: boolean) => {
    setHistoryOpen(open);
    if (open && events === null) void loadHistory();
  };

  const shownEvents =
    events && versionId ? events.filter((event) => event.versionId === versionId) : events;
  const pillLabel = version ? `v${version.versionNumber} · ${display.label}` : display.label;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={saving}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              aria-label={`Review status: ${pillLabel}`}
              data-review-status={shown.status}
              data-review-state-id={shown.stateId ?? ''}
              data-review-version={versionId ?? 'head'}
            >
              <Pill variant="secondary" className="cursor-pointer select-none">
                {saving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <StatusDot label={display} />
                )}
                {pillLabel}
                <ChevronDown className="size-3 text-muted-foreground" />
              </Pill>
            </button>
          }
        />
        <DropdownMenuContent align="start">
          {REVIEW_STATUS_ORDER.flatMap((candidate) => [
            <DropdownMenuItem
              key={candidate}
              disabled={candidate === shown.status && shown.stateId === null}
              onSelect={() => handleSelect({ status: candidate, stateId: null })}
              className="gap-2 text-xs"
              data-review-option={candidate}
            >
              <StatusDot label={labels[candidate]} />
              {labels[candidate].label}
            </DropdownMenuItem>,
            ...customStates
              .filter((state) => state.baseStatus === candidate)
              .map((state) => (
                <DropdownMenuItem
                  key={state.id}
                  disabled={state.id === shown.stateId}
                  onSelect={() => handleSelect({ status: candidate, stateId: state.id })}
                  className="gap-2 pl-5 text-xs"
                  data-review-option={candidate}
                  data-review-state-option={state.id}
                >
                  <StatusDot label={state} />
                  {state.label}
                </DropdownMenuItem>
              )),
          ])}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setLabelsOpen(true)} className="gap-2 text-xs">
            <Palette className="size-3.5" />
            Customize status labels…
          </DropdownMenuItem>
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
          <p className="mb-1 font-medium text-xs">
            Review history{version ? ` · v${version.versionNumber}` : ''}
          </p>
          <HistoryList events={shownEvents} labels={labels} customStates={customStates} />
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-2">
            <a
              href={approvalReportHref({ brandId, assetId: asset.id })}
              download
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3.5" />
              Approval report (this asset)
            </a>
            <a
              href={approvalReportHref({ brandId })}
              download
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3.5" />
              Approval report (all assets)
            </a>
          </div>
        </PopoverContent>
      </Popover>

      <ReviewStateLabelsEditor brandId={brandId} open={labelsOpen} onOpenChange={setLabelsOpen} />

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
              Move to{' '}
              {noteTarget
                ? reviewDisplay(noteTarget.status, noteTarget.stateId, labels, customStates).label
                : labels.needs_changes.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
