'use client';

// Names, never ids. "Key Metrics — account-521903353286118" shipped to a real customer
// because the Backend titles a composed block with the dataset's entity label and falls
// back to its id when the read carried no label (`autoCompose.ts defaultTitle`). The same
// report usually KNOWS the name: an actions row names the entity it moves, a table row
// carries `entity_id` beside the name in its first cell, a block's provenance carries the
// human label of what it covers. This module collects those into one map for the report and
// swaps an id in a title for the name when it has one. An id nobody named stays — an honest
// id beats an invented name, and it is what a user pastes into Ads Manager.

import { createContext, type ReactNode, useContext } from 'react';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';

/** Bare entity id → the name the report gave it. */
export type EntityNames = ReadonlyMap<string, string>;

// What a raw Meta id looks like in a title: `act_123`, `account-123`, `campaign-123`,
// `adset_123`, `ad-123`, or a bare run of digits long enough to be one.
const RAW_ID = /^(?:act_|(?:account|campaign|adset|ad)[-_])?(\d{6,})$/u;

/** The bare digits of a raw id, or null when the text is not an id. */
export function idKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = RAW_ID.exec(raw.trim());
  return match ? match[1] : null;
}

// A title's trailing entity: "Key Metrics — act_123", "Performance Trend – 123".
const TITLE_ENTITY = /^(.*?\S)\s[—–-]\s(\S+)\s*$/u;

const remember = (names: Map<string, string>, id: unknown, name: unknown): void => {
  if (typeof id !== 'string' || typeof name !== 'string') return;
  const key = idKey(id);
  const label = name.trim();
  // A "name" that is itself an id names nothing.
  if (!key || label.length === 0 || idKey(label) || names.has(key)) return;
  names.set(key, label);
};

/** Every entity the report's own blocks put a name to, keyed by its bare id. */
export function entityNamesOf(blocks: ReadonlyArray<CheckpointBlockV2>): EntityNames {
  const names = new Map<string, string>();
  for (const block of blocks) {
    if (block.category === 'actions') {
      for (const row of block.rows ?? []) remember(names, row.entity?.id, row.entity?.name);
    }
    if (block.category === 'data_table') {
      const nameColumn = (block.columns ?? []).find(
        (column) => !column.format || column.format === 'text',
      );
      (block.row_meta ?? []).forEach((meta, index) => {
        if (!nameColumn) return;
        remember(names, meta?.entity_id, block.rows?.[index]?.[nameColumn.key]);
      });
    }
    if (block.category === 'chart') {
      for (const meta of block.data_meta ?? []) remember(names, meta?.entity_id, meta?.entity_name);
    }
    // The provenance label is the name of whatever the title's trailing id points at.
    const trailing = TITLE_ENTITY.exec(block.title)?.[2];
    if (trailing && block.provenance?.entity_label) {
      remember(names, trailing, block.provenance.entity_label);
    }
  }
  return names;
}

/** The title with its trailing id replaced by the entity's name, when the report knows one. */
export function displayBlockTitle(title: string, names: EntityNames): string {
  const match = TITLE_ENTITY.exec(title);
  if (!match) return title;
  const key = idKey(match[2]);
  const name = key ? names.get(key) : undefined;
  return name ? `${match[1]} — ${name}` : title;
}

/** An entity's name for an id, else the id itself. */
export function displayEntity(id: string, names: EntityNames): string {
  const key = idKey(id);
  return (key && names.get(key)) || id;
}

const EntityNamesContext = createContext<EntityNames>(new Map());

export function EntityNamesProvider({
  names,
  children,
}: {
  names: EntityNames;
  children: ReactNode;
}) {
  return <EntityNamesContext.Provider value={names}>{children}</EntityNamesContext.Provider>;
}

export function useEntityNames(): EntityNames {
  return useContext(EntityNamesContext);
}
