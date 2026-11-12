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
import { useTranslations as useUiTranslations } from 'next-intl';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useStudioMetadata } from '../../hooks/useStudioMetadata';
import { ActionConfigFields } from '../../nodes/action/ActionConfigFields';
import { useStudioStore } from '../../stores/useStudioStore';
import type { ActionNodeData } from '../../types';
import { configFieldsFor } from '../../utils/actions/actionConfig';
import { InspectorNote, InspectorSection } from './controls';

export function ActionSection({ nodeId, data }: { nodeId: string; data: ActionNodeData }) {
  const translateUi = useUiTranslations('studio');
  const metadata = useStudioMetadata();

  const actionId: ActionId | undefined = isActionId(data.actionId) ? data.actionId : undefined;
  const def = actionDef(data.actionId);

  if (!actionId || !def) {
    return (
      <InspectorSection title={translateUi('operation_0f044feb')}>
        <InspectorNote>
          {' '}
          {translateUi('no_operation_is_set_pick_one_from_t_68bf558c')}{' '}
        </InspectorNote>
      </InspectorSection>
    );
  }

  return (
    <>
      <InspectorSection title={translateUi('operation_0f044feb')}>
        <InspectorNote>{metadata(def.description)}</InspectorNote>
      </InspectorSection>

      <InspectorSection title={translateUi('configuration_b332c349')}>
        {configFieldsFor(actionId).length === 0 ? (
          <InspectorNote>
            {translateUi('actionNoSettings', {
              operation: metadata(def.label),
            })}
          </InspectorNote>
        ) : (
          <ActionConfigFields nodeId={nodeId} actionId={actionId} config={data.config} />
        )}
      </InspectorSection>

      <InspectorSection title={translateUi('library_dc20b3d5')}>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${nodeId}-keep`}>
              {translateUi('keep_in_library_0bd372b9')}
            </FieldLabel>
            <FieldDescription>
              {' '}
              {translateUi('always_stored_so_it_can_be_wired_ke_45fa656b')}{' '}
            </FieldDescription>
          </FieldContent>
          <Switch
            id={`${nodeId}-keep`}
            checked={data.keep === true}
            onCheckedChange={(checked) =>
              useStudioStore.getState().updateNodeData(nodeId, { keep: checked })
            }
          />
        </Field>
      </InspectorSection>
    </>
  );
}
