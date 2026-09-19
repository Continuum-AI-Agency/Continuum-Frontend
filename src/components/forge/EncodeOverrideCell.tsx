'use client';

import type { ApiRenderTemplateContract, EncodeSettingKey } from '@continuum/contracts';
import { describeEncodeSettings, mergeEncodeSettings } from '@continuum/contracts';
import { useState } from 'react';
import {
  containersOf,
  EncodeSettingsFields,
  type InheritedEncode,
  setEncodeLeaves,
  withEncodeScope,
} from '@/components/forge/OutputSettingsPanel';
import {
  effectiveEncode,
  effectiveOutputIds,
  type RequestRow,
} from '@/components/forge/renderRequestRows';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// One render's output settings, over the template's. "Template default" means this row asks for
// nothing beyond what the template already says; anything else is pinned into the render when it
// fires. The closed cell reads the same one-line summary the review tray shows.

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

  const own = output ? row.encode?.outputs?.[output.id] : row.encode?.default;
  const cleared = output
    ? row.clearedEncodeKeys?.outputs?.[output.id]
    : row.clearedEncodeKeys?.default;
  // No outputs published (an older forge): both containers' knobs, as the template sheet shows.
  const inherited: InheritedEncode[] = output
    ? containersOf(output).map((container) => ({
        container,
        settings: mergeEncodeSettings(
          output.encode,
          effective?.default,
          parent?.outputs?.[output.id],
        ),
      }))
    : inScope.length
      ? inScope.flatMap((item) =>
          containersOf(item).map((container) => ({
            container,
            settings: mergeEncodeSettings(item.encode, parent?.default),
          })),
        )
      : [
          { container: 'mp4', settings: undefined },
          { container: 'mov', settings: undefined },
        ];

  const overridden = Object.keys(effective?.outputs ?? {}).length;
  const described =
    describeEncodeSettings(effective?.default, inherited[0]?.container ?? null) ??
    (effective?.default ? 'Custom settings' : null);
  const summary =
    [described, overridden ? `${overridden} output${overridden === 1 ? '' : 's'} adjusted` : null]
      .filter(Boolean)
      .join(' · ') || 'Template default';
  const scopes: Array<[string, string]> = [
    ['all', 'All outputs'],
    ...inScope.map((item): [string, string] => [
      item.id,
      `${item.label}${item.ratio ? ` · ${item.ratio}` : ''}`,
    ]),
  ];
  const withoutCleared = (changed: EncodeSettingKey[], add: boolean) => {
    const keys = (cleared ?? []).filter((item) => !changed.includes(item));
    return withEncodeScope(row.clearedEncodeKeys, scopeKey, add ? [...keys, ...changed] : keys);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label={`Output settings: ${summary}`}
            title={summary}
            className="max-w-40 truncate"
          >
            {summary}
          </Button>
        }
      />
      <PopoverContent className="w-96 space-y-3">
        <Select value={scopeKey} onValueChange={setScope}>
          <SelectTrigger aria-label="Output settings scope" className="w-full">
            <SelectValue items={Object.fromEntries(scopes)} />
          </SelectTrigger>
          <SelectContent>
            {scopes.map(([value, text]) => (
              <SelectItem key={value} value={value}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <EncodeSettingsFields
          key={scopeKey}
          settings={own}
          inherited={inherited}
          frameRate={output?.frameRate}
          cleared={cleared}
          onSet={(changes) =>
            onChange({
              encode: withEncodeScope(row.encode, scopeKey, setEncodeLeaves(own, changes)),
              clearedEncodeKeys: withoutCleared(Object.keys(changes) as EncodeSettingKey[], false),
            })
          }
          onClear={
            row.parentId
              ? (key) =>
                  onChange({
                    encode: withEncodeScope(
                      row.encode,
                      scopeKey,
                      setEncodeLeaves(own, { [key]: undefined }),
                    ),
                    clearedEncodeKeys: withoutCleared([key], true),
                  })
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
