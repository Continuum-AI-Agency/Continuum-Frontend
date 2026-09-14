'use client';

import type { ApiRenderTemplateContract, EncodeSettingKey } from '@continuum/contracts';
import { mergeEncodeSettings } from '@continuum/contracts';
import { useState } from 'react';
import {
  containersOf,
  describeEncodeSettings,
  EncodeSettingsFields,
  setEncodeLeaf,
  withEncodeScope,
} from '@/components/forge/OutputSettingsPanel';
import {
  effectiveEncode,
  effectiveOutputIds,
  type RequestRow,
} from '@/components/forge/renderRequestRows';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// One render's output settings, over the template's. "Template" means this row asks for nothing
// beyond what the template already says; anything else is pinned into the render when it fires.

export function EncodeOverrideCell({
  row,
  rows,
  outputs,
  onChange,
}: {
  row: RequestRow;
  rows: RequestRow[];
  outputs: ApiRenderTemplateContract['outputs'];
  onChange: (patch: Pick<RequestRow, 'encode' | 'clearedEncodeKeys'>) => void;
}) {
  const [scope, setScope] = useState('all');
  const effective = effectiveEncode(rows, row.id);
  const parent = row.parentId ? effectiveEncode(rows, row.parentId) : undefined;
  const selectedIds = effectiveOutputIds(rows, row.id);
  const inScope = outputs.filter(
    (output) => !selectedIds.length || selectedIds.includes(output.id),
  );
  const output = inScope.find((item) => item.id === scope);
  const scopeKey = output?.id ?? 'all';

  const overridden = Object.keys(effective?.outputs ?? {}).length;
  const summary = effective
    ? [
        describeEncodeSettings(effective.default),
        overridden ? `${overridden} output${overridden === 1 ? '' : 's'} adjusted` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Template';

  const own = output ? row.encode?.outputs?.[output.id] : row.encode?.default;
  const cleared = output
    ? row.clearedEncodeKeys?.outputs?.[output.id]
    : row.clearedEncodeKeys?.default;
  const inherited = output
    ? [mergeEncodeSettings(output.encode, effective?.default, parent?.outputs?.[output.id])]
    : inScope.map((item) => mergeEncodeSettings(item.encode, parent?.default));
  const withoutCleared = (key: EncodeSettingKey, add: boolean) => {
    const keys = (cleared ?? []).filter((item) => item !== key);
    return withEncodeScope(row.clearedEncodeKeys, scopeKey, add ? [...keys, key] : keys);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="xs" variant="outline" className="max-w-40 truncate">
            {summary}
          </Button>
        }
      />
      <PopoverContent className="w-96 space-y-3">
        <select
          aria-label="Output settings scope"
          value={scopeKey}
          onChange={(event) => setScope(event.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All outputs</option>
          {inScope.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.ratio ? ` · ${item.ratio}` : ''}
            </option>
          ))}
        </select>
        <EncodeSettingsFields
          key={scopeKey}
          settings={own}
          inherited={inherited}
          containers={
            output
              ? containersOf(output)
              : inScope.length
                ? [...new Set(inScope.flatMap(containersOf))]
                : ['mp4', 'mov']
          }
          frameRate={output?.frameRate}
          cleared={cleared}
          onSet={(key, value) =>
            onChange({
              encode: withEncodeScope(row.encode, scopeKey, setEncodeLeaf(own, key, value)),
              clearedEncodeKeys: withoutCleared(key, false),
            })
          }
          onClear={
            row.parentId
              ? (key) =>
                  onChange({
                    encode: withEncodeScope(
                      row.encode,
                      scopeKey,
                      setEncodeLeaf(own, key, undefined),
                    ),
                    clearedEncodeKeys: withoutCleared(key, true),
                  })
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
