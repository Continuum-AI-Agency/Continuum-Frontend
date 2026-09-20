'use client';

import {
  type ApiRenderTemplateContract,
  FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH,
  readableLayerName,
} from '@continuum/contracts';
import {
  ArrowDownToLine,
  BookmarkPlus,
  Check,
  Columns3,
  Copy,
  CornerDownRight,
  EyeOff,
  type LucideIcon,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { RefObject } from 'react';
import type { DataGridMenuTarget } from '@/components/forge/DataGrid';
import { MAX_BATCH_ROWS, type RequestRow, rowDepth } from '@/components/forge/renderRequestRows';
import type { RequestRowActions } from '@/components/forge/requestCells';
import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';

// Every row action the Render grid offers, as data. The row's ⋯ menu, the right-click menu and the
// selection bar all draw from these lists, so an action added to one is in all three and a reason
// it is unavailable reads the same everywhere.

export type GridAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Shown beside the label: the key that does the same thing. */
  shortcut?: string;
  /** What the action does, for a tooltip where the label is terse. */
  hint?: string;
  /** Why it cannot run right now. Disabled, never hidden, so the limit is something to read. */
  disabledReason?: string | null;
  destructive?: boolean;
  run: () => void;
  /** Where focus goes once the menu has closed — Rename hands it to the row's name. */
  focus?: () => HTMLElement | null;
};

export type GridActionContext = {
  rows: RequestRow[];
  selectedIds: string[];
  contract: ApiRenderTemplateContract;
  actions: RequestRowActions;
  /** Columns the person has hidden; "Show all columns" says how many. */
  hiddenColumns: number;
};

const FULL = `A render set holds at most ${MAX_BATCH_ROWS} rows`;
const TOO_DEEP = `Variations go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep`;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const rowNameInput = (rowId: string) =>
  document.querySelector<HTMLInputElement>(
    `tr[data-row-id="${rowId}"] input[aria-label="Row name"]`,
  );

/**
 * The rows `ids` acting together — the selection bar, or a right-click on a selected row. A count
 * rides on the label only when it is more than one, so a single row reads exactly like its ⋯ menu.
 */
export function selectionActions(
  ctx: GridActionContext,
  ids: string[],
  { counted = true } = {},
): GridAction[][] {
  const { rows, actions } = ctx;
  const suffix = counted && ids.length > 1 ? ` (${ids.length})` : '';
  const tooMany = rows.length + ids.length > MAX_BATCH_ROWS ? FULL : null;
  return [
    [
      {
        id: 'fork',
        label: `Add variation${suffix}`,
        icon: CornerDownRight,
        hint: 'Child rows that inherit every value until you change it',
        disabledReason:
          tooMany ??
          (ids.some((id) => rowDepth(rows, id) >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH)
            ? TOO_DEEP
            : null),
        run: () => actions.fork(ids),
      },
      {
        id: 'copy',
        label: `Copy${suffix}`,
        icon: Copy,
        hint: 'Independent copies, with no delivery',
        disabledReason: tooMany,
        run: () => actions.duplicate(ids),
      },
      {
        id: 'inputs',
        label: 'Save as inputs',
        icon: BookmarkPlus,
        hint: 'Save what this row renders with as a reusable input set',
        disabledReason: ids.length === 1 ? null : 'Select one row to save its inputs',
        run: () => ids[0] && actions.saveAsInputs(ids[0]),
      },
    ],
    [
      {
        id: 'delete',
        label: `Delete${suffix}`,
        icon: Trash2,
        destructive: true,
        run: () => actions.remove(ids),
      },
    ],
  ];
}

/** One row's own menu: the ⋯ button and a right-click on a row that is not part of a selection. */
export function rowActions(ctx: GridActionContext, rowId: string): GridAction[][] {
  const { rows, actions } = ctx;
  const full = rows.length >= MAX_BATCH_ROWS ? FULL : null;
  const [together, remove] = selectionActions(ctx, [rowId]);
  const [fork, copy, inputs] = together!;
  const proposal: GridAction[] = rows.find((row) => row.id === rowId)?.proposed
    ? [
        {
          id: 'keep',
          label: 'Keep',
          icon: Check,
          hint: 'Add this proposed row to the set',
          run: () => actions.keepProposed([rowId]),
        },
        {
          id: 'discard',
          label: 'Discard',
          icon: X,
          run: () => actions.discardProposed([rowId]),
        },
      ]
    : [];
  return [
    proposal,
    [
      {
        id: 'rename',
        label: 'Rename',
        icon: Pencil,
        run: () => {},
        focus: () => rowNameInput(rowId),
      },
      fork!,
      {
        id: 'below',
        label: 'Add row below',
        icon: Plus,
        hint: rows.find((row) => row.id === rowId)?.parentId
          ? 'Another variation of the same parent'
          : 'A new row right under this one',
        disabledReason: full,
        run: () => actions.addRowBelow(rowId),
      },
      {
        id: 'vary-ai',
        label: 'Vary with AI…',
        icon: Sparkles,
        hint: 'Variations of this row that change only what you pick',
        disabledReason:
          full ??
          (rowDepth(rows, rowId) >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH ? TOO_DEEP : null),
        run: () => actions.varyWithAi(rowId),
      },
      copy!,
      inputs!,
    ],
    remove!,
  ];
}

/** Right-click on one variable's cell: move its value around, then the row's own actions. */
export function cellActions(
  ctx: GridActionContext,
  rowId: string,
  key: string,
  above: string | null,
): GridAction[] {
  const { rows, selectedIds, actions } = ctx;
  const row = rows.find((item) => item.id === rowId);
  const targets = selectedIds.filter((id) => id !== rowId);
  const cell: GridAction[] = [
    {
      id: 'apply',
      label: `Apply to ${plural(targets.length, 'selected row')}`,
      icon: Copy,
      hint: 'Give the selected rows this cell’s value',
      disabledReason: targets.length ? null : 'Select rows to apply to',
      run: () => actions.applyValue(key, rowId, targets),
    },
    {
      id: 'fill',
      label: 'Fill from row above',
      icon: ArrowDownToLine,
      shortcut: '⌘D',
      disabledReason: above ? null : 'No row above',
      run: () => above && actions.applyValue(key, above, [rowId]),
    },
  ];
  if (!row?.parentId) return cell;
  const own = key in row.values || row.clearedKeys.includes(key);
  return [
    ...cell,
    own
      ? {
          id: 'reset',
          label: 'Reset to inherited',
          icon: RotateCcw,
          run: () => actions.resetIn(key, [rowId]),
        }
      : {
          id: 'clear',
          label: 'Clear inherited value',
          icon: X,
          run: () => actions.clearIn(key, [rowId]),
        },
  ];
}

export function formatsActions(ctx: GridActionContext, rowId: string): GridAction[] {
  const targets = ctx.selectedIds.filter((id) => id !== rowId);
  return [
    {
      id: 'apply-formats',
      label: `Apply formats to ${plural(targets.length, 'selected row')}`,
      icon: Copy,
      disabledReason: targets.length ? null : 'Select rows to apply to',
      run: () => ctx.actions.applyFormats(rowId, targets),
    },
  ];
}

/** A column header: the column's value across the selection, and whether the column shows. */
export function headerActions(
  ctx: GridActionContext,
  columnId: string,
  hideable: boolean,
): GridAction[][] {
  const { contract, selectedIds, rows, actions, hiddenColumns } = ctx;
  const variable = contract.variables.find((item) => item.key === columnId && !item.reserved);
  const view: GridAction[] = [
    ...(hideable
      ? [
          {
            id: 'hide',
            label: 'Hide column',
            icon: EyeOff,
            run: () => actions.hideColumn(columnId),
          },
        ]
      : []),
    {
      id: 'show-all',
      label: hiddenColumns ? `Show all columns (${hiddenColumns} hidden)` : 'Show all columns',
      icon: Columns3,
      disabledReason: hiddenColumns ? null : 'No columns are hidden',
      run: () => actions.showAllColumns(),
    },
  ];
  if (!variable) return [view];
  const name = readableLayerName(variable.label);
  const variations = selectedIds.filter((id) => {
    const row = rows.find((item) => item.id === id);
    return row?.parentId && (variable.key in row.values || row.clearedKeys.includes(variable.key));
  });
  const none = selectedIds.length ? null : 'Select rows first';
  return [
    [
      {
        id: 'clear-column',
        label: `Clear ${name} in ${plural(selectedIds.length, 'selected row')}`,
        icon: X,
        disabledReason: none,
        run: () => actions.clearIn(variable.key, selectedIds),
      },
      {
        id: 'reset-column',
        label: `Reset ${name} to inherited in ${plural(variations.length, 'row')}`,
        icon: RotateCcw,
        disabledReason:
          none ?? (variations.length ? null : 'No selected variation changes this value'),
        run: () => actions.resetIn(variable.key, variations),
      },
    ],
    view,
  ];
}

/** Everything a right-click can offer, by what it landed on. */
export function menuFor(
  ctx: GridActionContext,
  target: DataGridMenuTarget,
  above: string | null,
  hideable: (columnId: string) => boolean,
): GridAction[][] {
  const { columnId, rowId } = target;
  if (target.header) return columnId ? headerActions(ctx, columnId, hideable(columnId)) : [];
  if (!rowId)
    return [
      [
        {
          id: 'add',
          label: 'Add row',
          icon: Plus,
          disabledReason: ctx.rows.length >= MAX_BATCH_ROWS ? FULL : null,
          run: () => ctx.actions.addRow(),
        },
      ],
    ];
  const inSelection = ctx.selectedIds.length > 1 && ctx.selectedIds.includes(rowId);
  const rowGroups = inSelection ? selectionActions(ctx, ctx.selectedIds) : rowActions(ctx, rowId);
  const variable = ctx.contract.variables.find((item) => item.key === columnId && !item.reserved);
  if (variable) return [cellActions(ctx, rowId, variable.key, above), ...rowGroups];
  if (columnId === 'outputs' && ctx.contract.outputs.length)
    return [formatsActions(ctx, rowId), ...rowGroups];
  return rowGroups;
}

/**
 * A menu's items from action groups, in either kind of menu. Picking one with a `focus` parks it on
 * `focusAfter`, which the menu's `finalFocus` reads once it has closed.
 */
export function ActionMenuItems({
  groups,
  kind,
  focusAfter,
}: {
  groups: GridAction[][];
  kind: 'context' | 'dropdown';
  focusAfter?: RefObject<(() => HTMLElement | null) | null>;
}) {
  const Item = kind === 'context' ? ContextMenuItem : DropdownMenuItem;
  const Group = kind === 'context' ? ContextMenuGroup : DropdownMenuGroup;
  const Separator = kind === 'context' ? ContextMenuSeparator : DropdownMenuSeparator;
  const Shortcut = kind === 'context' ? ContextMenuShortcut : DropdownMenuShortcut;
  return groups
    .filter((group) => group.length)
    .map((group, index) => (
      <Group key={group[0]!.id}>
        {index > 0 ? <Separator /> : null}
        {group.map((action) => (
          <Item
            key={action.id}
            variant={action.destructive ? 'destructive' : 'default'}
            disabled={Boolean(action.disabledReason)}
            title={action.disabledReason ?? action.hint}
            onClick={() => {
              if (action.focus && focusAfter) focusAfter.current = action.focus;
              action.run();
            }}
          >
            <action.icon aria-hidden />
            {action.label}
            {action.shortcut ? <Shortcut>{action.shortcut}</Shortcut> : null}
          </Item>
        ))}
      </Group>
    ));
}

/**
 * A menu's `finalFocus`: what a picked action asked for; else, if the person has already put focus
 * somewhere — a field clicked while the menu was still fading — leave it there; else back to where
 * the menu came from. Without the middle case the menu's fade-out takes the field's focus away.
 */
export const takeFocusAfter =
  (focusAfter: RefObject<(() => HTMLElement | null) | null>) => (): HTMLElement | boolean => {
    const target = focusAfter.current?.();
    focusAfter.current = null;
    if (target) {
      if (target instanceof HTMLInputElement) queueMicrotask(() => target.select());
      return target;
    }
    const active = document.activeElement;
    return !active || active === document.body || Boolean(active.closest('[role="menu"]'));
  };
