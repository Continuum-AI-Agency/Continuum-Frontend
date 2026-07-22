import { useCallback, useRef } from 'react';
import { useCampaignStore } from '../stores/useCampaignStore';
import type { CampaignCanvasNodeData, CampaignData, CampaignNodeType } from '../types';

type FlowPosition = { x: number; y: number };

export type CampaignAIAction =
  | {
      type: 'CREATE_NODE';
      payload: {
        nodeType: CampaignNodeType;
        data: Record<string, unknown>;
        position?: FlowPosition;
        clientNodeId?: string;
      };
    }
  | {
      type: 'CONNECT_NODES';
      payload: {
        sourceId: string;
        targetId: string;
      };
    }
  | {
      type: 'UPDATE_NODE';
      payload: {
        nodeId: string;
        data: Record<string, unknown>;
      };
    }
  | {
      type: 'RECOMMEND_STRUCTURE';
      payload: {
        objective: CampaignData['objective'];
      };
    };

export const useCampaignAI = () => {
  const { addNode, updateNodeData, onConnect, nodes } = useCampaignStore();
  const nodeAliasMapRef = useRef<Map<string, string>>(new Map());

  const generateStandardCampaign = useCallback(
    (objective: CampaignData['objective']) => {
      // Logic to spawn a Campaign -> Ad Set -> Ad chain automatically
      addNode(
        'campaign',
        {
          label: `New ${objective} Campaign`,
          objective,
          buyingType: 'AUCTION',
          specialAdCategories: [],
        },
        { x: 250, y: 50 },
      );

      // Position ad sets below
      setTimeout(() => {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode) {
          addNode('ad-set', { label: 'Primary Ad Set' }, { x: 250, y: 250 });
        }
      }, 100);
    },
    [addNode, nodes],
  );

  const processAIAction = useCallback(
    (action: CampaignAIAction) => {
      switch (action.type) {
        case 'CREATE_NODE': {
          const { nodeType, data, position, clientNodeId } = action.payload;
          const nodeId = addNode(nodeType, data as Partial<CampaignCanvasNodeData>, position);
          if (clientNodeId) {
            nodeAliasMapRef.current.set(clientNodeId, nodeId);
          }
          break;
        }
        case 'CONNECT_NODES': {
          const { sourceId, targetId } = action.payload;
          const resolvedSourceId = nodeAliasMapRef.current.get(sourceId) ?? sourceId;
          const resolvedTargetId = nodeAliasMapRef.current.get(targetId) ?? targetId;
          onConnect({
            source: resolvedSourceId,
            sourceHandle: null,
            target: resolvedTargetId,
            targetHandle: null,
          });
          break;
        }
        case 'UPDATE_NODE': {
          const { nodeId, data } = action.payload;
          const resolvedNodeId = nodeAliasMapRef.current.get(nodeId) ?? nodeId;
          updateNodeData(resolvedNodeId, data as Partial<CampaignCanvasNodeData>);
          break;
        }
        case 'RECOMMEND_STRUCTURE': {
          generateStandardCampaign(action.payload.objective);
          break;
        }
      }
    },
    [addNode, generateStandardCampaign, onConnect, updateNodeData],
  );

  return { processAIAction };
};
