'use client';

// Brand admins rename and recolour the five review states, and define the brand's
// own custom states — each a named refinement of one of the five ("Legal review"
// within In review). The five and their workflow meaning are fixed; a custom
// state's base is fixed once saved (a different base is a new state). Every
// surface that shows a status picks the change up through useReviewStateLabels.

import type { MediaReviewStatus, ReviewCustomState, ReviewStateLabel } from '@continuum/contracts';
import { Loader2, Plus, X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast-imperative';
import { saveReviewStateLabels } from '@/lib/library/review';
import { REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';
import {
  setBrandReviewStates,
  useReviewCustomStates,
  useReviewStateLabels,
} from './useReviewStateLabels';

type DraftState = Omit<ReviewCustomState, 'id' | 'position'> & { id?: string; key: string };

const MAX_CUSTOM_STATES = 20;

// What the admin changed since the dialog opened: these fields keep the draft when the
// stored ones arrive; everything else follows the store.
function emptyTouched() {
  return { labels: new Set<MediaReviewStatus>(), custom: false, removed: new Set<string>() };
}

type Props = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewStateLabelsEditor({ brandId, open, onOpenChange }: Props) {
  const current = useReviewStateLabels(brandId);
  const currentCustom = useReviewCustomStates(brandId);
  // The draft lives in a ref that every edit replaces synchronously, and a counter
  // re-renders. Save reads the ref, so it sends what the admin last chose even when its
  // click lands before the previous edit has re-rendered (a Save handler from an older
  // render once sent a new custom state's default base instead of the one picked).
  const draftRef = useRef<{ labels: typeof current; custom: DraftState[] }>({
    labels: current,
    custom: [],
  });
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const update = (next: { labels?: typeof current; custom?: DraftState[] }) => {
    draftRef.current = { ...draftRef.current, ...next };
    rerender();
  };
  const { labels: draft, custom: customDraft } = draftRef.current;
  const [saving, setSaving] = useState(false);
  // The stored labels and states can land after the admin has started (the dialog opens
  // straight after a page load). They fold in under what the admin touched: a typed field
  // keeps its text, and every untouched one takes the stored value. Freezing the whole
  // draft on the first edit saved the defaults over the brand's labels, and an empty
  // custom-state list over its states.
  const touched = useRef(emptyTouched());

  useEffect(() => {
    if (!open) {
      touched.current = emptyTouched();
      return;
    }
    const { labels: draftLabels, custom: draftCustom } = draftRef.current;
    const mine = touched.current;
    const labels = { ...current };
    for (const state of mine.labels) labels[state] = draftLabels[state];
    const stored = currentCustom
      .filter((state) => !mine.removed.has(state.id))
      .map(
        (state) =>
          (mine.custom && draftCustom.find((row) => row.id === state.id)) || {
            ...state,
            key: state.id,
          },
      );
    update({ labels, custom: [...stored, ...draftCustom.filter((row) => !row.id)] });
    // biome-ignore lint/correctness/useExhaustiveDependencies: update only writes the ref
  }, [open, current, currentCustom]);

  const editCustom = (key: string, patch: Partial<DraftState>) => {
    touched.current.custom = true;
    update({
      custom: draftRef.current.custom.map((state) =>
        state.key === key ? { ...state, ...patch } : state,
      ),
    });
  };

  const edit = (state: MediaReviewStatus, patch: Partial<ReviewStateLabel>) => {
    touched.current.labels.add(state);
    const labels = draftRef.current.labels;
    update({ labels: { ...labels, [state]: { ...labels[state], ...patch } } });
  };

  const save = async () => {
    setSaving(true);
    try {
      const latest = draftRef.current;
      const labels = REVIEW_STATUS_ORDER.map((state, position) => ({
        ...latest.labels[state],
        label: latest.labels[state].label.trim(),
        position,
      }));
      const customStates = latest.custom.map(({ key: _key, ...state }, position) => ({
        ...state,
        label: state.label.trim(),
        position,
      }));
      setBrandReviewStates(brandId, await saveReviewStateLabels(brandId, labels, customStates));
      onOpenChange(false);
    } catch (error) {
      toast.error(`Saving status labels failed · ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const badLength = (label: string) => label.trim().length < 1 || label.trim().length > 40;
  const customLabels = customDraft.map((state) => state.label.trim().toLowerCase());
  const invalid =
    REVIEW_STATUS_ORDER.some((state) => badLength(draft[state].label)) ||
    customDraft.some((state) => badLength(state.label)) ||
    new Set(customLabels).size !== customLabels.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Status labels</DialogTitle>
          <DialogDescription className="text-xs">
            How each review state reads for this brand, everywhere a status shows, and the
            brand&apos;s own states within them.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {REVIEW_STATUS_ORDER.map((state) => (
            <div key={state} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`Colour for ${state}`}
                data-review-state={state}
                value={draft[state].color}
                onChange={(event) => edit(state, { color: event.target.value })}
                className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
              <Input
                aria-label={`Label for ${state}`}
                data-review-state={state}
                value={draft[state].label}
                maxLength={40}
                onChange={(event) => edit(state, { label: event.target.value })}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Custom states</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-2xs"
              data-testid="add-custom-state"
              disabled={customDraft.length >= MAX_CUSTOM_STATES}
              onClick={() => {
                touched.current.custom = true;
                update({
                  custom: [
                    ...draftRef.current.custom,
                    {
                      key: crypto.randomUUID(),
                      label: '',
                      color: '#8B5CF6',
                      baseStatus: 'in_review',
                    },
                  ],
                });
              }}
            >
              <Plus className="size-3" />
              Add
            </Button>
          </div>
          {customDraft.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              Your own states, each counted as one of the five above (e.g. “Legal review” as In
              review).
            </p>
          ) : null}
          {customDraft.map((state, index) => (
            <div
              key={state.key}
              className="flex items-center gap-2"
              data-custom-state-row={index}
              data-custom-state-base={state.baseStatus}
            >
              <input
                type="color"
                aria-label={`Colour for custom state ${index + 1}`}
                value={state.color}
                onChange={(event) => editCustom(state.key, { color: event.target.value })}
                className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
              <Input
                aria-label={`Custom state ${index + 1} name`}
                value={state.label}
                maxLength={40}
                placeholder="State name"
                onChange={(event) => editCustom(state.key, { label: event.target.value })}
                className="h-8 min-w-0 flex-1 text-xs"
              />
              <select
                aria-label={`Custom state ${index + 1} counts as`}
                value={state.baseStatus}
                disabled={Boolean(state.id)}
                title={
                  state.id ? 'A saved state keeps its base; add a new state instead' : undefined
                }
                onChange={(event) =>
                  editCustom(state.key, { baseStatus: event.target.value as MediaReviewStatus })
                }
                className="h-8 rounded-md border border-border bg-background px-1 text-xs disabled:opacity-60"
              >
                {REVIEW_STATUS_ORDER.map((base) => (
                  <option key={base} value={base}>
                    {draft[base].label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                aria-label={`Remove custom state ${index + 1}`}
                onClick={() => {
                  touched.current.custom = true;
                  if (state.id) touched.current.removed.add(state.id);
                  update({
                    custom: draftRef.current.custom.filter((row) => row.key !== state.key),
                  });
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={saving || invalid} onClick={() => void save()}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
