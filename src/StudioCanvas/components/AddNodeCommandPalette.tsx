'use client';

// Add Node, as ONE submenu with two modes. Hover "Add Node" and the palette opens beside
// it with a search box on top and the category submenus (Text / Image / Video / …) below,
// each opening on hover the way the old nested tree did. A category that spans providers
// nests one more level (Google › / Fal › / Continuum ›); the Action category nests as
// Tools › / Implementation › / one submenu per op family, and a multi-group family nests
// once more by the op registry's group (Colour › / Transform › / …) — `sectionLayout`
// decides, the palette just renders. Type, and it ALL gives way to cmdk's flat ranked
// list. Empty the box and the categories come back.
//
// cmdk (not Base UI Combobox) on purpose: its command-score MATCHES subsequences, so
// "vidgen" and "hyp" land on the right row. See Continuum-Frontend/AGENTS.md §4 and
// command.filter.test.tsx — the <Command> root must stay, or cmdk's children have no store.
//
// What cmdk does NOT do here is ORDER: command-score scores a subsequence across the row's
// whole searchable text (label + blurb + provider), so typing a node's exact name `Export`
// scored below `Text Block` — and cmdk highlights the first item in DOM order, which is
// catalog order. Typing an exact name and pressing Enter added the wrong node (D-07).
// The fix is therefore a RENDER-order pin, not a scoring tweak: an exact, case-insensitive
// label match is rendered first, in its own group, and left out of its normal one. Fuzzy
// matching is untouched — the settled cmdk decision stands, the defect was ordering.
//
// Techniques ride the same two modes: a "Techniques ›" submenu FIRST above the categories
// (the thing people reuse most), and a "Techniques" group in the ranked list. The palette
// is handed the list and the apply callback as props — it never touches the store or the
// apply hook itself, which is what keeps it renderable in a test with no canvas around it.

import type { ActionId, ActionModality, VideoGeneratorModel } from '@continuum/contracts';
import {
  Blocks,
  Braces,
  CalendarPlus,
  Camera,
  Clapperboard,
  Clock,
  Combine,
  Download,
  FastForward,
  FileImage,
  FileText,
  FileVideo,
  Film,
  Flame,
  Gem,
  Image,
  Layers,
  Layers2,
  ListVideo,
  Maximize2,
  Megaphone,
  Palette,
  Plus,
  Rocket,
  Send,
  Share2,
  Sparkles,
  StickyNote,
  Table,
  Type,
  Video,
  Volume2,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react';
import { type KeyboardEvent, useMemo, useState } from 'react';

import { GoogleIcon, type IconComponent } from '@/components/shared/icons';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { TechniqueItem } from '@/lib/ai-studio/techniques';

import {
  ACTION_FAMILY_LABELS,
  ADD_NODE_GROUPS,
  type AddNodeGroup,
  type AddNodeGroupSection,
  type AddNodeOpGroup,
  type AddNodeRow,
  type AddNodeSubGroup,
  addNodeRowKey,
  addNodeSearchValue,
  type StudioCanvasNodeType,
  sectionLayout,
} from './addNodeCatalog';

// Presentation only — the catalog stays pure data. Node glyphs reuse the icon each block
// component already renders for itself (Film on HyperframesAgentBlock, Camera on
// FrameExtractBlock, Share2 on RouterNode, …); the rest are new picks here. Brand marks
// come from @/components/shared/icons (lucide ships none); Fal and Continuum have no
// house glyph, so lucide stand-ins carry them.
const NODE_TYPE_ICONS: Record<StudioCanvasNodeType, IconComponent> = {
  nanoGen: Image,
  videoGen: Video,
  veoDirector: Video,
  veoFast: Video,
  omniGen: Wand2,
  extendVideo: FastForward,
  hyperframesAgent: Film,
  timelineEditor: ListVideo,
  layerEditor: Layers2,
  plannerDraft: CalendarPlus,
  organicPublish: Send,
  paidPublisher: Megaphone,
  apiRender: Braces,
  string: Type,
  note: StickyNote,
  image: FileImage,
  audio: Volume2,
  document: FileText,
  video: FileVideo,
  videoDecode: Clapperboard,
  frameExtract: Camera,
  action: Wand2,
  router: Share2,
  export: Download,
  batch: Table,
  element: Layers,
  designRef: Gem,
};

const FAMILY_ICONS: Record<ActionModality, IconComponent> = {
  image: Image,
  video: Video,
  text: Type,
};

const CATEGORY_ICONS: Record<AddNodeGroup, IconComponent> = {
  text: Type,
  image: Image,
  video: Video,
  audio: Volume2,
  document: FileText,
  action: Zap,
};

/** Provider submenus wear the host's mark; family submenus wear their modality's. */
const SUB_GROUP_ICONS: Record<AddNodeSubGroup['key'], IconComponent> = {
  google: GoogleIcon,
  fal: Flame,
  continuum: Sparkles,
  tools: Wrench,
  implementation: Rocket,
  ...FAMILY_ICONS,
};

/** The third level: op-registry groups, keyed by the label contracts gives them. */
const OP_GROUP_ICONS: Record<string, IconComponent> = {
  Colour: Palette,
  Transform: Maximize2,
  Time: Clock,
  Assembly: Combine,
  Overlay: Layers,
  Frames: Film,
  Text: Type,
};

/** An op row wears its family's glyph; every other row wears its node type's. */
const rowIcon = (row: AddNodeRow): IconComponent =>
  row.family ? FAMILY_ICONS[row.family] : NODE_TYPE_ICONS[row.type];

/** Every row with the section it belongs to, so a pinned row keeps its real search value. */
const ALL_ENTRIES: readonly { section: AddNodeGroupSection; row: AddNodeRow }[] =
  ADD_NODE_GROUPS.flatMap((section) => section.rows.map((row) => ({ section, row })));

/**
 * The rows whose label IS the query. Plural on purpose: five action ops share a label
 * across families, and putting both `Blur` rows on top is the honest answer to an
 * ambiguous exact match — better than picking one of them by score.
 */
const exactLabelMatches = (
  query: string,
): readonly { section: AddNodeGroupSection; row: AddNodeRow }[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return ALL_ENTRIES.filter((entry) => entry.row.label.toLowerCase() === needle);
};

/** A technique whose name IS the query pins beside the exact-label node rows. */
const exactTechniqueMatches = (items: TechniqueItem[], query: string): TechniqueItem[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return items.filter((item) => item.name.trim().toLowerCase() === needle);
};

/** What a technique's row says at the end: its port contract, e.g. "2 in · 1 out". */
const techniquePortSummary = (item: TechniqueItem): string =>
  `${item.inputPorts.length} in · ${item.outputPorts.length} out`;

const techniqueKindLabel = (item: TechniqueItem): string =>
  item.kind.charAt(0).toUpperCase() + item.kind.slice(1);

const TechniqueBody = ({ item }: { item: TechniqueItem }) => (
  <div className="flex min-w-0 flex-col">
    <span>{item.name}</span>
    <span className="text-xs text-muted-foreground">{techniqueKindLabel(item)}</span>
  </div>
);

/** What rides at the end of the row: who runs it, and for an op, what it runs on.
 *  A held-back op says so there instead — which lane it is matters less than the fact
 *  that clicking it will not do anything. */
const rowTag = (row: AddNodeRow): string =>
  row.comingSoon
    ? 'Coming soon'
    : row.family
      ? `${ACTION_FAMILY_LABELS[row.family]} · ${row.tag}`
      : row.tag;

/** What a row pre-configures on the node it creates — a video model, or an action's op. */
const addOptionsFor = (
  row: AddNodeRow,
): { model?: VideoGeneratorModel; actionId?: ActionId } | undefined =>
  row.model ? { model: row.model } : row.actionId ? { actionId: row.actionId } : undefined;

/** Sized by the menu/command item itself unless the surface's own convention says mr-2. */
const RowLeadingIcon = ({ row, className }: { row: AddNodeRow; className?: string }) => {
  const Icon = rowIcon(row);
  return <Icon className={className} />;
};

const RowBody = ({ row }: { row: AddNodeRow }) => (
  <div className="flex min-w-0 flex-col">
    <span>{row.label}</span>
    {/* The held-back sentence REPLACES the description: two lines of prose on a row the
        user cannot click is one line too many, and the reason is what they need. */}
    {row.comingSoon ? (
      <span className="text-xs text-muted-foreground">{row.comingSoon}</span>
    ) : row.desc ? (
      <span className="text-xs text-muted-foreground">{row.desc}</span>
    ) : null}
  </div>
);

/** The keys Base UI's menu may act on (arrow navigation, Home/End) once the box is empty. */
const isMenuNavigationKey = (key: string): boolean =>
  key.startsWith('Arrow') || key === 'Home' || key === 'End';

export type AddNodeHandler = (
  type: StudioCanvasNodeType,
  options?: { model?: VideoGeneratorModel; actionId?: ActionId },
) => void;

export type ApplyTechniqueHandler = (
  technique: TechniqueItem,
  options: { collapsed: boolean },
) => void;

export type PaletteTechniques = { items: TechniqueItem[]; isLoading: boolean };

const NO_TECHNIQUES: PaletteTechniques = { items: [], isLoading: false };

export function AddNodeCommandPalette({
  onAdd,
  onOpenChange,
  techniques = NO_TECHNIQUES,
  onApplyTechnique,
}: {
  onAdd: AddNodeHandler;
  /** Fires when the Add Node submenu opens or closes — the canvas pins the drop point on open. */
  onOpenChange?: (open: boolean) => void;
  /** Brand techniques merged with the global premades, as useTechniques returns them. */
  techniques?: PaletteTechniques;
  onApplyTechnique?: ApplyTechniqueHandler;
}) {
  const [query, setQuery] = useState('');
  // Presentation-only choice that lives as long as the menu does: the popup unmounts on
  // close, so it starts unticked on every open, like the search box starts empty.
  const [dropCollapsed, setDropCollapsed] = useState(false);
  const pinned = useMemo(() => exactLabelMatches(query), [query]);
  const pinnedKeys = useMemo(
    () => new Set(pinned.map((entry) => addNodeRowKey(entry.row))),
    [pinned],
  );
  const pinnedTechniques = useMemo(
    () => exactTechniqueMatches(techniques.items, query),
    [techniques.items, query],
  );
  const unpinnedTechniques = useMemo(
    () => techniques.items.filter((item) => !pinnedTechniques.includes(item)),
    [techniques.items, pinnedTechniques],
  );
  const applyTechnique = (item: TechniqueItem) =>
    onApplyTechnique?.(item, { collapsed: dropCollapsed });

  // The search box lives inside a Base UI menu popup, whose keydown handlers run typeahead
  // (any printable key jumps focus to a matching item and swallows the character) and
  // roving focus (arrows). With a query, cmdk owns every key: the list is the thing being
  // navigated. With none, arrows and Home/End are handed to the menu so they walk the
  // category submenus. Escape and Tab always pass — they are how the menu closes.
  const fenceMenuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') return;
    if (query === '' && isMenuNavigationKey(event.key)) return;
    event.stopPropagation();
  };

  const renderSearchRow = (section: AddNodeGroupSection, row: AddNodeRow) => (
    <CommandItem
      key={addNodeRowKey(row)}
      value={addNodeSearchValue(section, row)}
      // The op id and family on the DOM row are what studio-node-palette-bench reads to
      // prove every implemented op is offered exactly once and told apart, in the real
      // bundle. A pinned row keeps the value of the section it really belongs to.
      data-action-id={row.actionId}
      data-action-family={row.family}
      data-coming-soon={row.comingSoon ? '' : undefined}
      disabled={Boolean(row.comingSoon)}
      onSelect={() => {
        if (row.comingSoon) return;
        onAdd(row.type, addOptionsFor(row));
      }}
    >
      <RowLeadingIcon row={row} />
      <RowBody row={row} />
      <CommandShortcut>{rowTag(row)}</CommandShortcut>
    </CommandItem>
  );

  const renderTechniqueSearchRow = (item: TechniqueItem) => (
    <CommandItem
      key={`technique:${item.id}`}
      // The id keeps two same-named techniques apart: cmdk keys an item by its value.
      value={`${item.name} ${item.kind} technique ${item.id}`}
      data-technique-id={item.id}
      data-technique-tier={item.tier}
      onSelect={() => applyTechnique(item)}
    >
      <Blocks />
      <TechniqueBody item={item} />
      <CommandShortcut>{techniquePortSummary(item)}</CommandShortcut>
    </CommandItem>
  );

  const renderTechniqueMenuRow = (item: TechniqueItem) => (
    <ContextMenuItem
      key={item.id}
      data-technique-id={item.id}
      data-technique-tier={item.tier}
      onClick={() => applyTechnique(item)}
    >
      <Blocks className="mr-2 h-4 w-4" />
      <TechniqueBody item={item} />
      <ContextMenuShortcut>{techniquePortSummary(item)}</ContextMenuShortcut>
    </ContextMenuItem>
  );

  const renderTechniqueRows = () => {
    if (techniques.items.length === 0) {
      return (
        <ContextMenuItem disabled>
          {techniques.isLoading
            ? 'Loading…'
            : 'No techniques yet — select nodes, then Save as technique'}
        </ContextMenuItem>
      );
    }
    const brand = techniques.items.filter((item) => item.tier === 'brand');
    const premade = techniques.items.filter((item) => item.tier === 'global');
    // Both tiers present: label each. One tier: a flat list, no heading to read past.
    if (brand.length === 0 || premade.length === 0) {
      return techniques.items.map(renderTechniqueMenuRow);
    }
    return (
      <>
        <ContextMenuLabel>Brand</ContextMenuLabel>
        {brand.map(renderTechniqueMenuRow)}
        <ContextMenuSeparator />
        <ContextMenuLabel>Premade</ContextMenuLabel>
        {premade.map(renderTechniqueMenuRow)}
      </>
    );
  };

  const renderMenuRow = (row: AddNodeRow) => (
    <ContextMenuItem
      key={addNodeRowKey(row)}
      data-action-id={row.actionId}
      data-action-family={row.family}
      data-coming-soon={row.comingSoon ? '' : undefined}
      disabled={Boolean(row.comingSoon)}
      onClick={() => {
        if (row.comingSoon) return;
        onAdd(row.type, addOptionsFor(row));
      }}
    >
      <RowLeadingIcon row={row} className="mr-2 h-4 w-4" />
      <RowBody row={row} />
      <ContextMenuShortcut>{rowTag(row)}</ContextMenuShortcut>
    </ContextMenuItem>
  );

  const renderOpGroup = (category: string, opGroup: AddNodeOpGroup) => {
    const GroupIcon = OP_GROUP_ICONS[opGroup.label] ?? Wand2;
    return (
      <ContextMenuSub key={opGroup.key}>
        <ContextMenuSubTrigger inset data-subgroup={opGroup.key}>
          <GroupIcon className="mr-2 h-4 w-4" />
          {opGroup.label}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent
          className="nowheel w-72"
          data-testid="add-node-subgroup"
          data-category={category}
          data-subgroup={opGroup.key}
        >
          {opGroup.rows.map(renderMenuRow)}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  };

  return (
    <ContextMenuSub
      onOpenChange={(open) => {
        if (!open) setQuery('');
        onOpenChange?.(open);
      }}
    >
      <ContextMenuSubTrigger inset>
        <Plus className="mr-2 h-4 w-4" />
        Add Node
      </ContextMenuSubTrigger>
      {/* `nowheel` keeps a scroll inside the popup from zooming the React Flow pane; the
          height cap is Base UI's positioner var, so the Action category scrolls instead of
          running off the viewport. */}
      <ContextMenuSubContent className="nowheel w-80 p-0" data-testid="add-node-palette">
        <Command onKeyDown={fenceMenuKeys}>
          <CommandInput
            placeholder="Search nodes…"
            autoFocus
            data-testid="add-node-palette-input"
            value={query}
            onValueChange={setQuery}
          />
          {query ? (
            <CommandList>
              <CommandEmpty>No node matches that search.</CommandEmpty>
              {pinned.length > 0 || pinnedTechniques.length > 0 ? (
                <CommandGroup heading="Best match" data-testid="add-node-palette-pinned">
                  {pinnedTechniques.map(renderTechniqueSearchRow)}
                  {pinned.map((entry) => renderSearchRow(entry.section, entry.row))}
                </CommandGroup>
              ) : null}
              {/* Only while there are techniques: cmdk keeps an empty group's heading in
                  the DOM, and the headings are pinned to the catalog's labels. */}
              {unpinnedTechniques.length > 0 ? (
                <CommandGroup heading="Techniques" data-testid="add-node-palette-techniques">
                  {unpinnedTechniques.map(renderTechniqueSearchRow)}
                </CommandGroup>
              ) : null}
              {ADD_NODE_GROUPS.map((section) => {
                // A pinned row is rendered ONCE — cmdk keys an item by its value, so leaving
                // the original in place would collapse the pair back into one row.
                const rows = section.rows.filter((row) => !pinnedKeys.has(addNodeRowKey(row)));
                if (rows.length === 0) return null;
                return (
                  <CommandGroup key={section.group} heading={section.label}>
                    {rows.map((row) => renderSearchRow(section, row))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          ) : null}
        </Command>
        {/* Siblings of the cmdk root, not children: a keydown inside a category submenu
            bubbles through its React ancestors, and cmdk's root would otherwise claim
            Enter and the arrows before Base UI's own item handling saw them. */}
        {query ? null : (
          <ContextMenuSub>
            <ContextMenuSubTrigger inset data-testid="add-node-techniques-trigger">
              <Blocks className="mr-2 h-4 w-4" />
              Techniques
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="nowheel w-72" data-testid="add-node-techniques">
              <ContextMenuCheckboxItem
                checked={dropCollapsed}
                onCheckedChange={setDropCollapsed}
                data-testid="add-node-techniques-collapsed"
              >
                Drop collapsed
              </ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              {renderTechniqueRows()}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {query
          ? null
          : ADD_NODE_GROUPS.map((section) => {
              const CategoryIcon = CATEGORY_ICONS[section.group];
              // Direct rows first, then one submenu per sub-group: providers where the
              // category spans more than one, families for the op catalog. A
              // single-provider category has no sub-groups and stays one hover deep.
              const layout = sectionLayout(section);
              return (
                <ContextMenuSub key={section.group}>
                  <ContextMenuSubTrigger inset>
                    <CategoryIcon className="mr-2 h-4 w-4" />
                    {section.label}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent
                    className="nowheel w-72"
                    data-testid="add-node-category"
                    data-category={section.group}
                  >
                    {layout.direct.map(renderMenuRow)}
                    {layout.subGroups.map((sub) => {
                      const SubIcon = SUB_GROUP_ICONS[sub.key];
                      return (
                        <ContextMenuSub key={sub.key}>
                          <ContextMenuSubTrigger inset data-subgroup={sub.key}>
                            <SubIcon className="mr-2 h-4 w-4" />
                            {sub.label}
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent
                            className="nowheel w-72"
                            data-testid="add-node-subgroup"
                            data-category={section.group}
                            data-subgroup={sub.key}
                          >
                            {sub.rows.map(renderMenuRow)}
                            {(sub.subGroups ?? []).map((opGroup) =>
                              renderOpGroup(section.group, opGroup),
                            )}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      );
                    })}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              );
            })}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
