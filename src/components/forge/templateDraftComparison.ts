import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

const draftNumberFormats: Partial<Record<UiLocale, Intl.NumberFormat>> = {};
function formatDraftNumber(value: number, locale: UiLocale): string {
  const format = (draftNumberFormats[locale] ??= new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 21,
    useGrouping: false,
  }));
  return format.format(value);
}

type DraftUi = {
  t: ReturnType<typeof useTranslations<'forge'>>;
  locale: UiLocale;
  present: (source: string) => string;
};

import type { TemplateAuthoringCommand } from '@continuum/contracts';

export type DraftDifference = { label: string; local: string; server: string };

const propertyLabels: Record<string, string> = {
  position: 'Position',
  scale: 'Scale',
  rotation: 'Rotation',
  visible: 'Visibility',
  font: 'Font',
  fontSize: 'Font size',
};
const display = (value: unknown, ui?: DraftUi): string => {
  const present = ui?.present ?? ((source: string) => source);
  if (value === undefined) return present('No change');
  if (typeof value === 'boolean') return present(value ? 'Shown' : 'Hidden');
  if (Array.isArray(value))
    return ui ? value.map((part) => display(part, ui)).join(', ') : value.join(', ');
  if (typeof value === 'number' && ui) return formatDraftNumber(value, ui.locale);
  if (value && typeof value === 'object' && 'postScriptName' in value)
    return String(value.postScriptName);
  if (value && typeof value === 'object')
    return Object.values(value)
      .map((part) => display(part, ui))
      .join(' · ');
  return String(value);
};

export function compareTemplateDrafts(
  local: TemplateAuthoringCommand[],
  server: TemplateAuthoringCommand[],
  layerNames: Map<string, string> = new Map(),
  ui?: DraftUi,
): DraftDifference[] {
  const present = ui?.present ?? ((source: string) => source);
  const fields = new Map<string, { label: string; local?: unknown; server?: unknown }>();
  const collect = (commands: TemplateAuthoringCommand[], side: 'local' | 'server') => {
    for (const command of commands) {
      if (command.type === 'layer.edit') {
        const node = command.nodeId;
        const name =
          layerNames.get(node) ?? present(node.startsWith('draft:') ? 'New layer' : 'Layer');
        const changes =
          'compId' in command.edit
            ? Object.fromEntries(
                Object.entries(command.edit).filter(
                  ([key]) => key !== 'compId' && key !== 'layerId',
                ),
              )
            : command.edit;
        for (const [key, value] of Object.entries(changes)) {
          const label = propertyLabels[key] ? present(propertyLabels[key]) : undefined;
          if (!label) continue;
          const id = `${node}:${key}`;
          const item = fields.get(id) ?? { label: `${name} · ${label}` };
          item[side] = value;
          fields.set(id, item);
        }
      } else if (command.type === 'composition.order') {
        const id = `order:${command.compId}`;
        const compName =
          layerNames.get(`comp:${command.compId}`) ??
          ui?.t('draftCompositionLabel', { id: String(command.compId) }) ??
          `Composition ${command.compId}`;
        const item = fields.get(id) ?? { label: `${compName} · ${present('Layer order')}` };
        item[side] = command.nodeIds
          ? command.nodeIds.map(
              (nodeId) =>
                layerNames.get(nodeId) ??
                (nodeId.startsWith('draft:') ? present('New layer') : nodeId),
            )
          : (command.layerIds ?? []).map(
              (layerId) =>
                layerNames.get(`aep:${command.compId}:${layerId}`) ??
                ui?.t('draftLayerLabel', { id: String(layerId) }) ??
                `Layer ${layerId}`,
            );
        fields.set(id, item);
      } else if (command.type === 'exposure.set') {
        const id = `exposure:${command.slotKey}`;
        const item = fields.get(id) ?? { label: `${present('Exposure')} · ${command.slotKey}` };
        item[side] = command.exposed;
        fields.set(id, item);
      } else if (command.type === 'text.create') {
        const name = layerNames.get(command.nodeId) ?? command.name;
        for (const [property, value] of [
          ['Text', command.text],
          ['Font', command.fontRef.postScriptName],
          ['Font size', command.fontSize],
          ['Position', command.position],
        ] as const) {
          const id = `${command.nodeId}:${property}`;
          const item = fields.get(id) ?? { label: `${name} · ${present(property)}` };
          item[side] = value;
          fields.set(id, item);
        }
      } else if (command.type === 'layer.duplicate') {
        const name = layerNames.get(command.nodeId) ?? command.name;
        const id = `node:${command.nodeId}`;
        const item = fields.get(id) ?? { label: `${name} · ${present('Layer')}` };
        item[side] =
          ui?.t('draftCopyOf', {
            name: layerNames.get(command.sourceNodeId) ?? ui.t('draftSourceLayer'),
          }) ?? `Copy of ${layerNames.get(command.sourceNodeId) ?? 'source layer'}`;
        fields.set(id, item);
      } else if (command.type === 'layer.delete') {
        const id = `node:${command.nodeId}`;
        const item = fields.get(id) ?? {
          label: `${layerNames.get(command.nodeId) ?? present('Layer')} · ${present('Layer')}`,
        };
        item[side] = present('Removed');
        fields.set(id, item);
      }
    }
  };
  collect(local, 'local');
  collect(server, 'server');
  return [...fields.values()]
    .filter((item) => JSON.stringify(item.local) !== JSON.stringify(item.server))
    .map((item) => ({
      label: item.label,
      local: display(item.local, ui),
      server: display(item.server, ui),
    }));
}
