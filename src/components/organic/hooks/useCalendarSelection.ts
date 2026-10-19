import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCalendarStore } from '@/lib/organic/store';
import { useDraftDeletionConfirmation } from '../primitives/DraftDeletionConfirmation';
import type { OrganicCalendarDay, OrganicCalendarDraft } from '../primitives/types';

// Fields that type text. Not every <input>: a row's checkbox kept Delete and the arrows from
// the planner although it types nothing.
const EDITABLE_TARGET = [
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit])',
].join(', ');
const PLANNER_VIEW_REGION = '[data-tour-id="organic-list-content"]';
// A draggable chip or row carries data-dragging only while it is being carried. Not
// aria-pressed: a chip's button already uses that for its selection.
const ACTIVE_DRAG = '[data-dragging]';

/** Whether a key event came from a field that owns its own keys (the caption, a picker). */
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_TARGET) !== null;
}

/**
 * Whether a keydown is the planner's to act on. React bubbles events out of portals (a
 * dialog, a menu) to the planner root although their DOM sits elsewhere, a handled event
 * has already been answered, and keys typed into a field belong to that field: Backspace
 * in the caption raised the delete dialog and Escape there closed the whole preview. The
 * keys of a keyboard drag belong to the drag: its Escape cancels the move, not the preview.
 */
export function isPlannerKeyEvent(event: React.KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  const { target, currentTarget } = event;
  if (!(target instanceof Element) || !currentTarget.contains(target)) return false;
  return !isEditableTarget(target) && target.closest(ACTIVE_DRAG) === null;
}

// Delete and the arrows act on the grid's selection, so they answer from the grid (or the
// bare planner root), never from the preview beside it.
function isFromPlannerView(event: React.KeyboardEvent): boolean {
  const target = event.target as Element;
  return target === event.currentTarget || target.closest(PLANNER_VIEW_REGION) !== null;
}

export const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/**
 * The slice of the selection one grid cell needs. A cell that holds no selected draft gets
 * `null` and the shared empty set, so a click re-renders only the memoised cells the
 * selection leaves and enters, not every cell of the week or month.
 */
export function selectionWithin(
  drafts: readonly OrganicCalendarDraft[],
  selectedDraftId: string | null,
  selectedDraftIdSet: ReadonlySet<string>,
): { selectedDraftId: string | null; selectedDraftIdSet: ReadonlySet<string> } {
  return {
    selectedDraftId:
      selectedDraftId !== null && drafts.some((draft) => draft.id === selectedDraftId)
        ? selectedDraftId
        : null,
    selectedDraftIdSet:
      selectedDraftIdSet.size > 0 && drafts.some((draft) => selectedDraftIdSet.has(draft.id))
        ? selectedDraftIdSet
        : EMPTY_SELECTION,
  };
}

export type SelectionFocusTarget = { kind: 'draft' | 'post'; id: string; dayId?: string | null };

/**
 * Where focus returns when the preview closes. Re-queried rather than held, because
 * ArrowUp/Down, deep links and remounts all replace the chip node. A month chip folded
 * into "+N more" falls back to that button; a draft with no chip on screen (another week)
 * falls back to its attention-dock row, then to the planner root.
 */
export function findSelectionFocusTarget(
  root: HTMLElement,
  target: SelectionFocusTarget,
): HTMLElement {
  const attribute = target.kind === 'draft' ? 'data-draft-id' : 'data-post-id';
  return (
    findByAttribute(root, attribute, target.id) ??
    (target.dayId ? findByAttribute(root, 'data-day-overflow', target.dayId) : null) ??
    (target.kind === 'draft' ? findDockRow(root, target.id) : null) ??
    root
  );
}

function findDockRow(root: HTMLElement, draftId: string): HTMLElement | null {
  return findByAttribute(root, 'data-dock-draft-id', draftId)?.querySelector('button') ?? null;
}

const OPENER_OWNER = '[data-draft-id], [data-dock-draft-id], [data-post-id]';

/**
 * Whether the control that opened the preview still stands for what it shows. ArrowUp/Down
 * move the selection without a new opener, so the stored one can belong to the draft left
 * behind. A chip, a dock row or its "Add media" button sits inside the element carrying
 * the id it opened.
 */
export function openerShowsTarget(opener: HTMLElement, target: SelectionFocusTarget): boolean {
  const owner = opener.closest(OPENER_OWNER);
  if (!owner) return false;
  const id =
    target.kind === 'post'
      ? owner.getAttribute('data-post-id')
      : (owner.getAttribute('data-draft-id') ?? owner.getAttribute('data-dock-draft-id'));
  return id === target.id;
}

// Compares attribute values instead of interpolating ids into a selector, so no id needs
// escaping (CSS.escape is also missing from the test DOM).
function findByAttribute(root: HTMLElement, attribute: string, value: string): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    if (element.getAttribute(attribute) === value) return element;
  }
  return null;
}

type UseCalendarSelectionOptions = {
  /**
   * Called whenever the user dismisses the preview (close, collapse, Escape). The URL
   * writer lives at the call site rather than in here so the hook stays a pure selection
   * machine — `?draftId=` has to be stripped, or the workspace's deep-link watcher
   * re-selects the draft on the very next render.
   */
  onDismiss?: () => void;
};

export function useCalendarSelection(
  days: OrganicCalendarDay[] = [],
  { onDismiss }: UseCalendarSelectionOptions = {},
) {
  const { requestDraftDeletion } = useDraftDeletionConfirmation();
  const {
    selectedDraftId,
    setSelectedDraftId,
    selectedDraftIds,
    toggleDraftSelection,
    clearDraftSelection,
    bulkDeleteDrafts,
    setEditingDraftId,
  } = useCalendarStore(
    useShallow((state) => ({
      selectedDraftId: state.selectedDraftId,
      setSelectedDraftId: state.setSelectedDraftId,
      selectedDraftIds: state.selectedDraftIds,
      toggleDraftSelection: state.toggleDraftSelection,
      clearDraftSelection: state.clearDraftSelection,
      bulkDeleteDrafts: state.bulkDeleteDrafts,
      setEditingDraftId: state.setEditingDraftId,
    })),
  );

  const orderedDraftIds = React.useMemo(
    () => days.flatMap((day) => day.slots.map((slot) => slot.id)),
    [days],
  );

  const orderedDraftIndexById = React.useMemo(() => {
    const indexById = new Map<string, number>();
    orderedDraftIds.forEach((id, index) => {
      indexById.set(id, index);
    });
    return indexById;
  }, [orderedDraftIds]);

  // Collapsing is a distinct operation from clearing: the draft stays selected
  // (so the preview can be re-opened without hunting for the row again) while the
  // panel renders at zero width.
  const [isPreviewCollapsed, setIsPreviewCollapsed] = React.useState(false);

  // EVERY draft the user has dismissed from the preview panel, not just the last one.
  // Two effects in the workspace re-select a draft automatically — the `?draftId=` deep
  // link and the last-draft restore — and both fire the instant a selection is nulled.
  // With a single slot, dismissing draft B forgot that A was dismissed, so the deep-link
  // watcher re-selected A and the panel could never be closed at all.
  const [dismissedDraftIds, setDismissedDraftIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const rememberDismissal = React.useCallback((draftId: string | null) => {
    if (!draftId) return;
    setDismissedDraftIds((previous) => {
      if (previous.has(draftId)) return previous;
      const next = new Set(previous);
      next.add(draftId);
      return next;
    });
  }, []);

  const rearmDraft = React.useCallback((draftId: string | null) => {
    if (!draftId) return;
    setDismissedDraftIds((previous) => {
      if (!previous.has(draftId)) return previous;
      const next = new Set(previous);
      next.delete(draftId);
      return next;
    });
  }, []);

  const handleSelect = React.useCallback(
    (id: string, isMulti: boolean = false) => {
      if (isMulti) {
        toggleDraftSelection(id);
        return;
      }
      setSelectedDraftId(id);
      clearDraftSelection();
      setIsPreviewCollapsed(false);
      rearmDraft(id);
    },
    [toggleDraftSelection, setSelectedDraftId, clearDraftSelection, rearmDraft],
  );

  // Dismissing the panel abandons the edit intent too. Without this, the workspace's
  // expand-on-edit effect would re-open the panel the instant it was collapsed. The
  // selection is read at call time so this stays stable across selections: memoised
  // grid chips receive handlers built on it.
  const clearAll = React.useCallback(() => {
    rememberDismissal(useCalendarStore.getState().selectedDraftId);
    setSelectedDraftId(null);
    setEditingDraftId(null);
    clearDraftSelection();
    setIsPreviewCollapsed(false);
    onDismiss?.();
  }, [clearDraftSelection, onDismiss, rememberDismissal, setEditingDraftId, setSelectedDraftId]);

  const collapsePreview = React.useCallback(() => {
    rememberDismissal(selectedDraftId);
    setEditingDraftId(null);
    setIsPreviewCollapsed(true);
    onDismiss?.();
  }, [onDismiss, rememberDismissal, selectedDraftId, setEditingDraftId]);

  // Re-arms only the draft being re-opened. Clearing the whole set here is what let the
  // loop start over: expanding one preview un-suppressed every draft ever dismissed.
  const expandPreview = React.useCallback(() => {
    rearmDraft(selectedDraftId);
    setIsPreviewCollapsed(false);
  }, [rearmDraft, selectedDraftId]);

  const isAutoSelectSuppressed = React.useCallback(
    (candidateDraftId: string | null | undefined) =>
      candidateDraftId != null && dismissedDraftIds.has(candidateDraftId),
    [dismissedDraftIds],
  );

  const handleDelete = React.useCallback(() => {
    const idsToDelete = selectedDraftId ? [selectedDraftId] : selectedDraftIds;
    if (idsToDelete.length > 0) {
      requestDraftDeletion(idsToDelete, (ids) => {
        bulkDeleteDrafts(ids);
        clearAll();
      });
    }
  }, [selectedDraftId, selectedDraftIds, bulkDeleteDrafts, clearAll, requestDraftDeletion]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!isPlannerKeyEvent(e)) return;

      // Escape closes the preview regardless of where the draft sits. Resolving it
      // through the ordered index first left Escape dead for any draft outside the
      // visible range — which is precisely the deep-linked draft the agent opens.
      if (e.key === 'Escape') {
        clearAll();
        return;
      }

      if (!isFromPlannerView(e)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDelete();
        e.preventDefault();
        return;
      }

      if (!selectedDraftId && selectedDraftIds.length === 0) return;

      const currentId = selectedDraftId || selectedDraftIds[selectedDraftIds.length - 1];
      const currentIndex = orderedDraftIndexById.get(currentId) ?? -1;

      if (currentIndex === -1) return;

      if (e.key === 'ArrowDown') {
        const nextId = orderedDraftIds[currentIndex + 1];
        if (nextId) {
          handleSelect(nextId, e.shiftKey);
          e.preventDefault();
        }
      } else if (e.key === 'ArrowUp') {
        const prevId = orderedDraftIds[currentIndex - 1];
        if (prevId) {
          handleSelect(prevId, e.shiftKey);
          e.preventDefault();
        }
      }
    },
    [
      clearAll,
      handleDelete,
      handleSelect,
      orderedDraftIds,
      orderedDraftIndexById,
      selectedDraftId,
      selectedDraftIds,
    ],
  );

  return {
    selectedId: selectedDraftId,
    selectedIds: selectedDraftIds,
    handleSelect,
    clearAll,
    toggleMulti: toggleDraftSelection,
    handleKeyDown,
    isPreviewCollapsed,
    collapsePreview,
    expandPreview,
    isAutoSelectSuppressed,
  };
}
