'use client';

import type { BlendField } from '@continuum/contracts';
import { ChevronRight, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { SceneFieldControl } from './SceneFieldControl';
import type { SceneChanges, SceneValue } from './sceneEditorReducer';

// Every field the .blend offers, sorted the way an author looks for it: the copy and pictures
// first, then each object's visibility and transform, the camera this output looks through, the
// lights, and whatever else the parse found. The editor sends `scope: 'all'`, so hidden fields are
// editable here too; they only sit lower down.

export type SceneFieldGroup = 'content' | 'objects' | 'camera' | 'lights' | 'advanced';

export const SCENE_GROUP_TITLES: Record<SceneFieldGroup, string> = {
  content: 'Content',
  objects: 'Objects',
  camera: 'Camera',
  lights: 'Lights',
  advanced: 'Advanced',
};

const GROUP_ORDER: SceneFieldGroup[] = ['content', 'objects', 'camera', 'lights', 'advanced'];
const OPEN_BY_DEFAULT = new Set<SceneFieldGroup>(['content', 'objects', 'camera']);

/**
 * Where one field belongs. `camera` is the selected output's camera object; `cameras` is every
 * output's — moving a camera the picked output does not look through changes nothing on screen,
 * so those sit in Advanced rather than among the objects.
 */
export function sceneFieldGroup(
  field: BlendField,
  camera: string | null,
  cameras: ReadonlySet<string>,
): SceneFieldGroup {
  const { idCode, idName, path } = field.target;
  if (idCode === 'OB' && idName === camera) return 'camera';
  if (cameras.has(idName) || path.startsWith('camera.')) return 'advanced';
  if (idCode === 'LA') return 'lights';
  if (idCode === 'OB' && (path === 'hide_render' || path.startsWith('transform.')))
    return 'objects';
  return field.exposed ? 'content' : 'advanced';
}

export function groupSceneFields(
  fields: readonly BlendField[],
  camera: string | null,
  cameras: ReadonlySet<string>,
): Array<{ group: SceneFieldGroup; fields: BlendField[] }> {
  const grouped = new Map<SceneFieldGroup, BlendField[]>(GROUP_ORDER.map((group) => [group, []]));
  for (const field of fields) grouped.get(sceneFieldGroup(field, camera, cameras))?.push(field);
  return GROUP_ORDER.map((group) => ({ group, fields: grouped.get(group) ?? [] })).filter(
    (entry) => entry.fields.length > 0,
  );
}

function byObject(fields: BlendField[]): Array<[string, BlendField[]]> {
  const objects = new Map<string, BlendField[]>();
  for (const field of fields) {
    const own = objects.get(field.target.idName) ?? [];
    own.push(field);
    objects.set(field.target.idName, own);
  }
  return [...objects];
}

/** "Swatch · location" is read aloud as "Swatch location". */
export const sceneFieldLabel = (field: BlendField) => field.name.replaceAll(' · ', ' ');

/** Inside an object's own heading, its name is noise: "Swatch · location" shows "location". */
const shortName = (field: BlendField) => {
  const prefix = `${field.target.idName} · `;
  return field.name.startsWith(prefix) ? field.name.slice(prefix.length) : field.name;
};

function Section({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-b border-border">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-3 py-2 text-left text-3xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
        <ChevronRight
          className="size-3 transition-transform group-data-[panel-open]:rotate-90"
          aria-hidden
        />
        {title}
        <span className="ml-auto tabular-nums">{count}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <section aria-label={title} className="flex flex-col gap-1 px-2 pb-3">
          {children}
        </section>
      </CollapsibleContent>
    </Collapsible>
  );
}

type RowProps = {
  brandId: string;
  changes: SceneChanges;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onChange: (key: string, value: SceneValue) => void;
  onReset: (key: string) => void;
};

function FieldRow({
  field,
  shown,
  brandId,
  changes,
  selectedKey,
  onSelect,
  onChange,
  onReset,
}: RowProps & { field: BlendField; shown: string }) {
  const label = sceneFieldLabel(field);
  const changed = field.key in changes;
  return (
    // Focus anywhere in the row selects its field; the reducer keeps one undo step per field run.
    <div
      data-field={field.key}
      data-selected={selectedKey === field.key || undefined}
      onFocusCapture={() => onSelect(field.key)}
      className={cn(
        'flex flex-col gap-1 rounded-md px-1.5 py-1',
        selectedKey === field.key && 'bg-muted/60',
      )}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs" title={field.name}>
          {shown}
          {changed ? (
            <span aria-hidden className="ml-1.5 inline-block size-1.5 rounded-full bg-primary" />
          ) : null}
        </span>
        {changed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Reset ${label}`}
            title="Back to the file's value"
            onClick={() => onReset(field.key)}
          >
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
      </div>
      <SceneFieldControl
        brandId={brandId}
        field={field}
        label={label}
        value={(changes[field.key] ?? field.default) as SceneValue | null}
        onChange={(next) => (next === null ? onReset(field.key) : onChange(field.key, next))}
      />
    </div>
  );
}

export function SceneInspector({
  fields,
  camera,
  cameras,
  ...row
}: RowProps & {
  fields: readonly BlendField[];
  camera: string | null;
  cameras: ReadonlySet<string>;
}) {
  const groups = groupSceneFields(fields, camera, cameras);
  if (!groups.length) {
    return <p className="p-3 text-xs text-muted-foreground">This file exposes no fields.</p>;
  }
  return (
    <div className="flex flex-col">
      {groups.map(({ group, fields: members }) => (
        <Section
          key={group}
          title={SCENE_GROUP_TITLES[group]}
          count={members.length}
          defaultOpen={OPEN_BY_DEFAULT.has(group)}
        >
          {group === 'objects'
            ? byObject(members).map(([object, own]) => (
                <div key={object} className="flex flex-col gap-0.5 pt-1">
                  <h4 className="px-1.5 text-2xs font-medium">{object}</h4>
                  {own.map((field) => (
                    <FieldRow key={field.key} field={field} shown={shortName(field)} {...row} />
                  ))}
                </div>
              ))
            : members.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  shown={group === 'camera' ? shortName(field) : field.name}
                  {...row}
                />
              ))}
        </Section>
      ))}
    </div>
  );
}
