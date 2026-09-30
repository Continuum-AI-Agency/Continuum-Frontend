'use client';
import { upstreamDraft } from '../../nodes/OrganicPublishBlock';
import { useStudioStore } from '../../stores/useStudioStore';
import type { OrganicPublishNodeData, StudioNode } from '../../types';
import { InspectorNote, InspectorSection, OptionRow } from './controls';

export function OrganicPublishSettings({
  node,
  onPatch,
}: {
  node: StudioNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const draft = upstreamDraft({ nodeId: node.id, nodes, edges });
  const data = node.data as OrganicPublishNodeData;
  return (
    <div className="flex flex-col gap-5">
      <InspectorSection title="Destination">
        <p className="text-sm">{draft?.title ?? 'Connect a saved Planner Draft'}</p>
        <InspectorNote>
          {draft?.platform ?? 'The connected draft supplies the platform and account.'}
        </InspectorNote>
      </InspectorSection>
      <InspectorSection title="When to publish">
        <OptionRow
          label="Timing"
          value={data.schedule ?? 'now'}
          options={[
            { value: 'now', label: 'Post now' },
            { value: 'scheduled', label: 'Planner schedule' },
          ]}
          onChange={(schedule) => onPatch({ schedule })}
        />
      </InspectorSection>
      <InspectorSection title="Review">
        <InspectorNote>
          {data.schedule === 'scheduled'
            ? 'Reviewing and confirming arms the Planner schedule. The post becomes public at its saved time.'
            : 'Reviewing and confirming publishes to the account on the saved draft.'}
        </InspectorNote>
      </InspectorSection>
    </div>
  );
}
