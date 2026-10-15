import type { TemplateAuthoringCommand } from '@continuum/contracts';

export type DraftDifference = { label: string; local: string; server: string };

const propertyLabels: Record<string, string> = {
  position: 'Position', scale: 'Scale', rotation: 'Rotation', visible: 'Visibility',
  font: 'Font', fontSize: 'Font size',
};
const display = (value: unknown): string => {
  if (value === undefined) return 'No change';
  if (typeof value === 'boolean') return value ? 'Shown' : 'Hidden';
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object' && 'postScriptName' in value)
    return String(value.postScriptName);
  if (value && typeof value === 'object') return Object.values(value).map(display).join(' · ');
  return String(value);
};

export function compareTemplateDrafts(
  local: TemplateAuthoringCommand[],
  server: TemplateAuthoringCommand[],
  layerNames: Map<string, string> = new Map(),
): DraftDifference[] {
  const fields = new Map<string, { label: string; local?: unknown; server?: unknown }>();
  const collect = (commands: TemplateAuthoringCommand[], side: 'local' | 'server') => {
    for (const command of commands) {
      if (command.type === 'layer.edit') {
        const node = command.nodeId;
        const name = layerNames.get(node) ?? (node.startsWith('draft:') ? 'New layer' : 'Layer');
        const changes = 'compId' in command.edit
          ? Object.fromEntries(Object.entries(command.edit).filter(([key]) => key !== 'compId' && key !== 'layerId'))
          : command.edit;
        for (const [key, value] of Object.entries(changes)) {
          const label = propertyLabels[key];
          if (!label) continue;
          const id = `${node}:${key}`;
          const item = fields.get(id) ?? { label: `${name} · ${label}` };
          item[side] = value;
          fields.set(id, item);
        }
      } else if (command.type === 'composition.order') {
        const id = `order:${command.compId}`;
        const compName = layerNames.get(`comp:${command.compId}`) ?? `Composition ${command.compId}`;
        const item = fields.get(id) ?? { label: `${compName} · Layer order` };
        item[side] = command.nodeIds
          ? command.nodeIds.map((nodeId) => layerNames.get(nodeId) ?? (nodeId.startsWith('draft:') ? 'New layer' : nodeId))
          : (command.layerIds ?? []).map((layerId) => layerNames.get(`aep:${command.compId}:${layerId}`) ?? `Layer ${layerId}`);
        fields.set(id, item);
      } else if (command.type === 'exposure.set') {
        const id = `exposure:${command.slotKey}`;
        const item = fields.get(id) ?? { label: `Exposure · ${command.slotKey}` };
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
          const item = fields.get(id) ?? { label: `${name} · ${property}` };
          item[side] = value;
          fields.set(id, item);
        }
      } else if (command.type === 'layer.duplicate') {
        const name = layerNames.get(command.nodeId) ?? command.name;
        const id = `node:${command.nodeId}`;
        const item = fields.get(id) ?? { label: `${name} · Layer` };
        item[side] = `Copy of ${layerNames.get(command.sourceNodeId) ?? 'source layer'}`;
        fields.set(id, item);
      } else if (command.type === 'layer.delete') {
        const id = `node:${command.nodeId}`;
        const item = fields.get(id) ?? { label: `${layerNames.get(command.nodeId) ?? 'Layer'} · Layer` };
        item[side] = 'Removed';
        fields.set(id, item);
      }
    }
  };
  collect(local, 'local');
  collect(server, 'server');
  return [...fields.values()]
    .filter((item) => JSON.stringify(item.local) !== JSON.stringify(item.server))
    .map((item) => ({ label: item.label, local: display(item.local), server: display(item.server) }));
}
