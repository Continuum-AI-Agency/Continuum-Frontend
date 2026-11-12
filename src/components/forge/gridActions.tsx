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
import type { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import type { DataGridMenuTarget } from '@/components/forge/DataGrid';
import { MAX_BATCH_ROWS, type RequestRow, rowDepth } from '@/components/forge/renderRequestRows';
import type { RequestRowActions } from '@/components/forge/requestCells';
import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  /**
   * A submenu. `run` stays meaningful alongside it — the selection bar renders actions as plain
   * buttons, where the parent must still do the obvious thing.
   */
  items?: GridAction[];
  /** Where focus goes once the menu has closed — Rename hands it to the row's name. */
  focus?: () => HTMLElement | null;
};

export type GridActionContext = {
  translate?: ReturnType<typeof useTranslations<'forge'>>;
  rows: RequestRow[];
  selectedIds: string[];
  contract: ApiRenderTemplateContract;
  actions: RequestRowActions;
  /** Columns the person has hidden; "Show all columns" says how many. */
  hiddenColumns: number;
  /** A draft already running. One field read by all three builders, not a guard per call site. */
  generating: boolean;
};

const FULL = `A render set holds at most ${MAX_BATCH_ROWS} rows`;
/** What a menu click can ask for. 20 is the API ceiling and 40-60s of model time; nobody wants it
 * without saying why, and that is what "With a brief…" is for. */
const COUNTS = [3, 6, 12];
/** Rows one click may generate for. Each is its own model call. */
const AI_ROWS_MAX = 5;
const BUSY = 'A draft is already running';
const PICTURE_NEEDS_BRIEF = 'Pick pictures with a brief';
const TOO_DEEP = `Variations go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep`;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const isPictureKind = (kind: string) => kind === 'image' || kind === 'video';

/**
 * The keys a no-typing draft may change: every proposable variable except the pictures.
 *
 * Nothing is auto-detected here — the cursor already did that. What the brief used to carry was
 * never the row's values (those reach the model either way) but WHICH keys may move, and that is
 * said structurally instead. Pictures are left out on purpose: with no brief the Library search
 * falls back to a slot's own label and returns plausible-but-arbitrary assets that pass every
 * downstream check, so a picture changes only through "With a brief…".
 */
const keysToVary = (ctx: GridActionContext) =>
  ctx.contract.variables
    .filter((variable) => !variable.reserved && !isPictureKind(variable.kind))
    .map((variable) => variable.key);

/** "Six more like this", as a menu: presets, then the brief for everything they cannot say. */
function aiGenerateAction(
  ctx: GridActionContext,
  args: {
    ids: string[];
    varyKeys: string[];
    label: string;
    hint: string;
    /** Set when the presets cannot run but a brief still can — a picture cell. */
    presetsBlocked?: string | null;
  },
): GridAction {
  const { rows, actions } = ctx;
  const stopped =
    (ctx.generating
      ? (ctx.translate?.('a_draft_is_already_running_0e3244ee') ?? 'A draft is already running')
      : null) ??
    (args.ids.some((id) => rowDepth(rows, id) >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH)
      ? (ctx.translate?.('variations_go_at_most_value0_levels_67852798', {
          value0: String(FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH),
        }) ?? `Variations go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep`)
      : null) ??
    (args.ids.length > AI_ROWS_MAX
      ? (ctx.translate?.('generate_for_at_most_value0_rows_at_e1156797', {
          value0: String(AI_ROWS_MAX),
        }) ?? `Generate for at most ${AI_ROWS_MAX} rows at once`)
      : null);
  const presets =
    stopped ??
    args.presetsBlocked ??
    (args.varyKeys.length
      ? null
      : (ctx.translate?.('nothing_here_can_be_varied_without__8ec3540a') ??
        'Nothing here can be varied without a brief'));
  // Checked per preset, not once: the model call and every Library read are spent before
  // `appendRows` refuses a batch that overflows, and it refuses the whole batch.
  const fits = (count: number) =>
    rows.length + count * args.ids.length > MAX_BATCH_ROWS
      ? (ctx.translate?.('a_render_set_holds_at_most_value0_r_8bc0f843', {
          value0: String(MAX_BATCH_ROWS),
        }) ?? `A render set holds at most ${MAX_BATCH_ROWS} rows`)
      : null;
  const items: GridAction[] = [
    ...COUNTS.map((count) => ({
      id: `generate-ai-${count}`,
      label: ctx.translate?.('gridVariations', { count }) ?? `${count} variations`,
      icon: Sparkles,
      disabledReason: presets ?? fits(count),
      run: () =>
        actions.generateWithAi({
          ids: args.ids,
          count,
          varyKeys: args.varyKeys,
        }),
    })),
    {
      id: 'generate-ai-brief',
      label: ctx.translate?.('with_a_brief_59daf833') ?? 'With a brief…',
      icon: Pencil,
      hint:
        ctx.translate?.('say_what_should_change_the_only_way_1b40d81d') ??
        'Say what should change — the only way to vary a picture',
      disabledReason:
        stopped ??
        (args.ids.length === 1
          ? null
          : (ctx.translate?.('select_one_row_to_write_a_brief_for_ec2eab1e') ??
            'Select one row to write a brief for')),
      run: () => args.ids[0] && actions.varyWithAi(args.ids[0], args.varyKeys),
    },
  ];
  // Disabled only when nothing inside can run. A disabled submenu trigger cannot be opened, and
  // on a picture cell that would hide the brief — the one route that CAN vary a picture — behind
  // the very reason it exists. `run` is the first item that can run, so the selection bar, which
  // renders this as a plain button with no submenu, still does the obvious thing.
  const primary = items.find((item) => !item.disabledReason);
  return {
    id: 'generate-ai',
    label: args.label,
    icon: Sparkles,
    hint: args.hint,
    disabledReason: primary ? null : (stopped ?? presets ?? fits(COUNTS[0]!)),
    run: () => primary?.run(),
    items,
  };
}

export const rowNameInput = (rowId: string) =>
  document.querySelector<HTMLInputElement>(`tr[data-row-id="${rowId}"] input[data-row-name-input]`);

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
  const tooMany =
    rows.length + ids.length > MAX_BATCH_ROWS
      ? (ctx.translate?.('a_render_set_holds_at_most_value0_r_8bc0f843', {
          value0: String(MAX_BATCH_ROWS),
        }) ?? `A render set holds at most ${MAX_BATCH_ROWS} rows`)
      : null;
  return [
    [
      {
        id: 'fork',
        label:
          ctx.translate?.('add_variation_value0_aba3d924', {
            value0: String(suffix),
          }) ?? `Add variation${suffix}`,
        icon: CornerDownRight,
        hint:
          ctx.translate?.('child_rows_that_inherit_every_value_ce57c27c') ??
          'Child rows that inherit every value until you change it',
        disabledReason:
          tooMany ??
          (ids.some((id) => rowDepth(rows, id) >= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH)
            ? (ctx.translate?.('variations_go_at_most_value0_levels_67852798', {
                value0: String(FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH),
              }) ?? `Variations go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep`)
            : null),
        run: () => actions.fork(ids),
      },
      {
        id: 'copy',
        label:
          ctx.translate?.('copy_value0_4394b67d', { value0: String(suffix) }) ?? `Copy${suffix}`,
        icon: Copy,
        hint:
          ctx.translate?.('independent_copies_with_no_delivery_079b582d') ??
          'Independent copies, with no delivery',
        disabledReason: tooMany,
        run: () => actions.duplicate(ids),
      },
      aiGenerateAction(ctx, {
        ids,
        varyKeys: keysToVary(ctx),
        label:
          ctx.translate?.('generate_with_ai_value0_3f071779', {
            value0: String(suffix),
          }) ?? `Generate with AI${suffix}`,
        hint:
          ctx.translate?.('variations_of_each_selected_row_wit_e8084861') ??
          'Variations of each selected row, with no brief to write',
      }),
      {
        id: 'inputs',
        label: ctx.translate?.('save_as_inputs_b47d5e52') ?? 'Save as inputs',
        icon: BookmarkPlus,
        hint:
          ctx.translate?.('save_what_this_row_renders_with_as__f7726ae6') ??
          'Save what this row renders with as a reusable input set',
        disabledReason:
          ids.length === 1
            ? null
            : (ctx.translate?.('select_one_row_to_save_its_inputs_9ee78f76') ??
              'Select one row to save its inputs'),
        run: () => ids[0] && actions.saveAsInputs(ids[0]),
      },
    ],
    [
      {
        id: 'delete',
        label:
          ctx.translate?.('delete_value0_77d113c2', {
            value0: String(suffix),
          }) ?? `Delete${suffix}`,
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
  const full =
    rows.length >= MAX_BATCH_ROWS
      ? (ctx.translate?.('a_render_set_holds_at_most_value0_r_8bc0f843', {
          value0: String(MAX_BATCH_ROWS),
        }) ?? `A render set holds at most ${MAX_BATCH_ROWS} rows`)
      : null;
  const [together, remove] = selectionActions(ctx, [rowId]);
  // By id, not by position: this group grows, and a positional pick silently renames an item.
  const shared = (id: string) => together!.find((action) => action.id === id)!;
  const fork = shared('fork');
  const copy = shared('copy');
  const inputs = shared('inputs');
  const proposal: GridAction[] = rows.find((row) => row.id === rowId)?.proposed
    ? [
        {
          id: 'keep',
          label: ctx.translate?.('keep_183f00f4') ?? 'Keep',
          icon: Check,
          hint:
            ctx.translate?.('add_this_proposed_row_to_the_set_43e2f051') ??
            'Add this proposed row to the set',
          run: () => actions.keepProposed([rowId]),
        },
        {
          id: 'discard',
          label: ctx.translate?.('discard_eb1a70e3') ?? 'Discard',
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
        label: ctx.translate?.('rename_3064d79a') ?? 'Rename',
        icon: Pencil,
        run: () => {},
        focus: () => rowNameInput(rowId),
      },
      fork,
      {
        id: 'below',
        label: ctx.translate?.('add_row_below_3d48302e') ?? 'Add row below',
        icon: Plus,
        hint: rows.find((row) => row.id === rowId)?.parentId
          ? (ctx.translate?.('another_variation_of_the_same_paren_339bdf8b') ??
            'Another variation of the same parent')
          : (ctx.translate?.('a_new_row_right_under_this_one_1683afb2') ??
            'A new row right under this one'),
        disabledReason: full,
        run: () => actions.addRowBelow(rowId),
      },
      aiGenerateAction(ctx, {
        ids: [rowId],
        varyKeys: keysToVary(ctx),
        label: ctx.translate?.('generate_with_ai_0dbd8403') ?? 'Generate with AI',
        hint:
          ctx.translate?.('variations_of_this_row_with_no_brie_69210ef4') ??
          'Variations of this row, with no brief to write',
      }),
      copy,
      inputs,
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
  const { rows, selectedIds, contract, actions } = ctx;
  const row = rows.find((item) => item.id === rowId);
  const targets = selectedIds.filter((id) => id !== rowId);
  const variable = contract.variables.find((item) => item.key === key);
  const picture = variable ? isPictureKind(variable.kind) : false;
  const name = variable
    ? readableLayerName(variable.label)
    : (ctx.translate?.('this_value_e2bcc44f') ?? 'this value');
  const cell: GridAction[] = [
    aiGenerateAction(ctx, {
      ids: [rowId],
      // One key, because that is what the cursor pointed at.
      varyKeys: [key],
      label: ctx.translate?.('vary_value0_656a504d', { value0: String(name) }) ?? `Vary ${name}`,
      hint:
        ctx.translate?.('variations_of_this_row_that_change__0f6b1a8e', {
          value0: String(name),
        }) ?? `Variations of this row that change only ${name}`,
      presetsBlocked: picture
        ? (ctx.translate?.('pick_pictures_with_a_brief_b502707a') ?? 'Pick pictures with a brief')
        : null,
    }),
    {
      id: 'apply',
      label:
        ctx.translate?.('gridApplyRows', { count: targets.length }) ??
        `Apply to ${plural(targets.length, 'selected row')}`,
      icon: Copy,
      hint:
        ctx.translate?.('give_the_selected_rows_this_cell_s__c07efde3') ??
        'Give the selected rows this cell’s value',
      disabledReason: targets.length
        ? null
        : (ctx.translate?.('select_rows_to_apply_to_28e0fbca') ?? 'Select rows to apply to'),
      run: () => actions.applyValue(key, rowId, targets),
    },
    {
      id: 'fill',
      label: ctx.translate?.('fill_from_row_above_870d0dad') ?? 'Fill from row above',
      icon: ArrowDownToLine,
      shortcut: '⌘D',
      disabledReason: above ? null : (ctx.translate?.('no_row_above_ebb66472') ?? 'No row above'),
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
          label: ctx.translate?.('reset_to_inherited_af537e74') ?? 'Reset to inherited',
          icon: RotateCcw,
          run: () => actions.resetIn(key, [rowId]),
        }
      : {
          id: 'clear',
          label: ctx.translate?.('clear_inherited_value_6a234cfc') ?? 'Clear inherited value',
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
      label:
        ctx.translate?.('gridApplyFormats', { count: targets.length }) ??
        `Apply formats to ${plural(targets.length, 'selected row')}`,
      icon: Copy,
      disabledReason: targets.length
        ? null
        : (ctx.translate?.('select_rows_to_apply_to_28e0fbca') ?? 'Select rows to apply to'),
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
            label: ctx.translate?.('hide_column_c646b55d') ?? 'Hide column',
            icon: EyeOff,
            run: () => actions.hideColumn(columnId),
          },
        ]
      : []),
    {
      id: 'show-all',
      label: hiddenColumns
        ? (ctx.translate?.('show_all_columns_value0_hidden_a7dc3584', {
            value0: String(hiddenColumns),
          }) ?? `Show all columns (${hiddenColumns} hidden)`)
        : (ctx.translate?.('show_all_columns_87e6b9fe') ?? 'Show all columns'),
      icon: Columns3,
      disabledReason: hiddenColumns
        ? null
        : (ctx.translate?.('no_columns_are_hidden_85595835') ?? 'No columns are hidden'),
      run: () => actions.showAllColumns(),
    },
  ];
  if (!variable) return [view];
  const name = readableLayerName(variable.label);
  const variations = selectedIds.filter((id) => {
    const row = rows.find((item) => item.id === id);
    return row?.parentId && (variable.key in row.values || row.clearedKeys.includes(variable.key));
  });
  const none = selectedIds.length
    ? null
    : (ctx.translate?.('select_rows_first_27e93558') ?? 'Select rows first');
  return [
    [
      {
        id: 'clear-column',
        label:
          ctx.translate?.('gridClearColumn', {
            name,
            count: selectedIds.length,
          }) ?? `Clear ${name} in ${plural(selectedIds.length, 'selected row')}`,
        icon: X,
        disabledReason: none,
        run: () => actions.clearIn(variable.key, selectedIds),
      },
      {
        id: 'reset-column',
        label:
          ctx.translate?.('gridResetColumn', {
            name,
            count: variations.length,
          }) ?? `Reset ${name} to inherited in ${plural(variations.length, 'row')}`,
        icon: RotateCcw,
        disabledReason:
          none ??
          (variations.length
            ? null
            : (ctx.translate?.('no_selected_variation_changes_this__b091ae26') ??
              'No selected variation changes this value')),
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
          label: ctx.translate?.('add_row_1868a8dd') ?? 'Add row',
          icon: Plus,
          disabledReason:
            ctx.rows.length >= MAX_BATCH_ROWS
              ? (ctx.translate?.('a_render_set_holds_at_most_value0_r_8bc0f843', {
                  value0: String(MAX_BATCH_ROWS),
                }) ?? `A render set holds at most ${MAX_BATCH_ROWS} rows`)
              : null,
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
  const Sub = kind === 'context' ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger = kind === 'context' ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent = kind === 'context' ? ContextMenuSubContent : DropdownMenuSubContent;
  const item = (action: GridAction) => (
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
  );
  return groups
    .filter((group) => group.length)
    .map((group, index) => (
      <Group key={group[0]!.id}>
        {index > 0 ? <Separator /> : null}
        {group.map((action) =>
          action.items ? (
            <Sub key={action.id}>
              <SubTrigger
                disabled={Boolean(action.disabledReason)}
                title={action.disabledReason ?? action.hint}
              >
                <action.icon aria-hidden />
                {action.label}
              </SubTrigger>
              <SubContent>{action.items.map(item)}</SubContent>
            </Sub>
          ) : (
            item(action)
          ),
        )}
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
