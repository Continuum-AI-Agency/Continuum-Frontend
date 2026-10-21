'use client';

import type { HyperframesOrderView } from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { NativeEditorForm } from './nativeEditorEdits';

/** Bound mounted controls independently of the parser's complete sibling inventory. */
export function NativeHyperframesOrder({
  view,
  value,
  onChange,
}: {
  view: HyperframesOrderView;
  value: NativeEditorForm['orders'];
  onChange: (value: NativeEditorForm['orders']) => void;
}) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [page, setPage] = useState(0);
  const group = view.groups[groupIndex];
  const labels = useMemo(
    () => new Map(group?.children.map((child) => [child.nodeId, child.tag])),
    [group],
  );
  const nodeIds = value[groupIndex]?.nodeIds ?? [];
  const first = page * 20;
  if (!group)
    return (
      <p className="text-xs text-muted-foreground">
        This source has no reorderable sibling groups.
      </p>
    );
  const selectGroup = (offset: number) => {
    setGroupIndex((index) => index + offset);
    setPage(0);
  };
  const move = (position: number, offset: number) => {
    const next = structuredClone(value);
    const ids = next[groupIndex]!.nodeIds;
    [ids[position], ids[position + offset]] = [ids[position + offset]!, ids[position]!];
    onChange(next);
    setPage(Math.floor((position + offset) / 20));
  };
  return (
    <div className="space-y-2">
      {view.groups.length > 1 ? (
        <div className="flex items-center gap-2 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={groupIndex === 0}
            onClick={() => selectGroup(-1)}
          >
            Previous group
          </Button>
          <span>
            Group {groupIndex + 1} of {view.groups.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={groupIndex + 1 === view.groups.length}
            onClick={() => selectGroup(1)}
          >
            Next group
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {group.parentTag} · {group.parentId}
      </p>
      <ol
        start={first + 1}
        className="divide-y divide-border"
        aria-label={`Element order in ${group.parentId}`}
      >
        {nodeIds.slice(first, first + 20).map((nodeId, index) => {
          const position = first + index;
          return (
            <li key={nodeId} className="flex items-center justify-between gap-2 py-1 text-xs">
              <span>
                {labels.get(nodeId)} · {nodeId}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${nodeId} earlier`}
                  disabled={position === 0}
                  onClick={() => move(position, -1)}
                >
                  Earlier
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${nodeId} later`}
                  disabled={position === nodeIds.length - 1}
                  onClick={() => move(position, 1)}
                >
                  Later
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      {nodeIds.length > 20 ? (
        <div className="flex items-center gap-2 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous elements
          </Button>
          <span>
            Elements {first + 1}–{Math.min(first + 20, nodeIds.length)} of {nodeIds.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={first + 20 >= nodeIds.length}
            onClick={() => setPage(page + 1)}
          >
            Next elements
          </Button>
        </div>
      ) : null}
    </div>
  );
}
