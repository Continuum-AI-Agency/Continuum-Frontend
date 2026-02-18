import { useCallback } from 'react';
import { useCampaignStore } from '../stores/useCampaignStore';
import { type CampaignNodeType } from '../types';

export const useCampaignAI = () => {
  const { addNode, updateNodeData, onConnect, nodes } = useCampaignStore();

  const processAIAction = useCallback((action: any) => {
    switch (action.type) {
      case 'CREATE_NODE': {
        const { nodeType, data, position } = action.payload;
        addNode(nodeType as CampaignNodeType, data, position);
        break;
      }
      case 'CONNECT_NODES': {
        const { sourceId, targetId } = action.payload;
        onConnect({ source: sourceId, target: targetId });
        break;
      }
      case 'UPDATE_NODE': {
        const { nodeId, data } = action.payload;
        updateNodeData(nodeId, data);
        break;
      }
      case 'RECOMMEND_STRUCTURE': {
        // Implement complex multi-node structure generation
        generateStandardCampaign(action.payload.objective);
        break;
      }
    }
  }, [addNode, updateNodeData, onConnect]);

  const generateStandardCampaign = (objective: string) => {
    // Logic to spawn a Campaign -> Ad Set -> Ad chain automatically
    const campaignId = 'campaign-' + Date.now();
    addNode('campaign', { label: 'New ' + objective + ' Campaign', objective } as any, { x: 250, y: 50 });
    
    // Position ad sets below
    setTimeout(() => {
      const lastNode = nodes[nodes.length - 1];
      if (lastNode) {
        addNode('ad-set', { label: 'Primary Ad Set' }, { x: 250, y: 250 });
      }
    }, 100);
  };

  return { processAIAction };
};
