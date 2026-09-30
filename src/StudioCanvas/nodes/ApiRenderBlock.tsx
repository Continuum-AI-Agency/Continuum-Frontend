'use client';
import {
  apiRenderTargetHandles,
  apiRenderVariableLabel,
  getAllowedSourceHandles,
} from '@continuum/contracts';
import type { NodeProps, Node as ReactFlowNode } from '@xyflow/react';
import { Clapperboard, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudioStore } from '../stores/useStudioStore';
import type { ApiRenderNodeData } from '../types';
import { runImplementationNode } from '../utils/runImplementationNode';
import { ImplementationNode } from './ImplementationNode';

export { describeRenderDiscoveryFailure } from './api-render/renderDiscoveryCopy';
export function ApiRenderBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<ApiRenderNodeData>>) {
  const inputs = apiRenderTargetHandles({ id, type: 'apiRender', data }).map((handle) => ({
    id: handle,
    label: apiRenderVariableLabel(
      data.variableDefinitions?.find((variable) => `variable-${variable.key}` === handle) ?? {
        key: handle,
        label: handle,
      },
    ),
  }));
  const outputs = getAllowedSourceHandles({ id, type: 'apiRender', data }).map((handle) => ({
    id: handle,
    label:
      handle === 'collection' ? 'All outputs' : handle.replace('render-', '').replace('-', ' '),
  }));
  const fresh = () => {
    const store = useStudioStore.getState();
    store.updateNodeData(id, {
      renderEpoch: crypto.randomUUID(),
      renderRequestIds: [],
      renderInputSignature: undefined,
    });
    void runImplementationNode(id).catch(() => undefined);
  };
  return (
    <ImplementationNode
      id={id}
      selected={selected}
      title="Forge Render"
      icon={Clapperboard}
      summary={data.templateName ?? 'Choose a ready Forge template'}
      inputs={inputs}
      outputs={outputs}
      status={
        data.isExecuting
          ? 'Rendering · outputs will be saved in Library'
          : data.renderOutputs?.length
            ? `${data.renderOutputs.length} saved outputs · ready for downstream steps`
            : data.templateKey
              ? `${inputs.length} template inputs · saves to Library`
              : 'Configure a template to expose its fields'
      }
      error={data.error}
    >
      <Button
        size="sm"
        className="ml-auto"
        disabled={Boolean(data.isExecuting) || !data.templateKey}
        onClick={() => void runImplementationNode(id).catch(() => undefined)}
      >
        <Play className="size-3.5" aria-hidden />{' '}
        {data.isExecuting
          ? 'Rendering…'
          : data.status === 'finished'
            ? 'Load outputs'
            : data.renderRequestIds?.length
              ? 'Resume render'
              : 'Render'}
      </Button>
      {data.status === 'finished' ? (
        <Button variant="outline" size="sm" disabled={Boolean(data.isExecuting)} onClick={fresh}>
          New render
        </Button>
      ) : null}
    </ImplementationNode>
  );
}
