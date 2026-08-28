'use client';

// The action node's section of the selection inspector.
//
// Every op's knobs come from `configFieldsFor` via `ActionConfigFields`, the same
// component the on-node gear popover renders — so a new registry field shows up here
// without anyone touching this file, and the two surfaces can never disagree.
//
// Ops with no configurable field (most of the image family) still get a section: the
// note is what tells you the node is fully configured, where an empty panel reads as
// something failing to load.

import { type ActionId, actionDef, isActionId } from '@continuum/contracts';

import { ActionConfigFields } from '../../nodes/action/ActionConfigFields';
import type { ActionNodeData } from '../../types';
import { configFieldsFor } from '../../utils/actions/actionConfig';
import { InspectorNote, InspectorSection } from './controls';

export function ActionSection({ nodeId, data }: { nodeId: string; data: ActionNodeData }) {
  const actionId: ActionId | undefined = isActionId(data.actionId) ? data.actionId : undefined;
  const def = actionDef(data.actionId);

  if (!actionId || !def) {
    return (
      <InspectorSection title="Operation">
        <InspectorNote>
          No operation is set. Pick one from the canvas menu to configure this node.
        </InspectorNote>
      </InspectorSection>
    );
  }

  return (
    <>
      <InspectorSection title="Operation">
        <InspectorNote>{def.description}</InspectorNote>
      </InspectorSection>

      <InspectorSection title="Configuration">
        {configFieldsFor(actionId).length === 0 ? (
          <InspectorNote>{def.label} takes no settings — wire it up and run it.</InspectorNote>
        ) : (
          <ActionConfigFields nodeId={nodeId} actionId={actionId} config={data.config} />
        )}
      </InspectorSection>
    </>
  );
}
