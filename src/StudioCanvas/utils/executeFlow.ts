import { Edge } from '@xyflow/react';
import { StudioNode } from '../types';
import { useStudioStore } from '../stores/useStudioStore';

const DELAY_NANO = 2000;
const DELAY_VEO = 4000;

export async function executeFlow() {
  const { nodes, edges, updateNodeData } = useStudioStore.getState();

  // Reset
  nodes.forEach(n => {
     if (n.type !== 'string') updateNodeData(n.id, { isExecuting: true, generatedImage: undefined, generatedVideo: undefined });
  });

  // Find Nano Gen Nodes
  const nanoNodes = nodes.filter(n => n.type === 'nanoGen');
  
  for (const node of nanoNodes) {
    console.log(`Executing Nano Gen: ${node.id}`);
    await new Promise(resolve => setTimeout(resolve, DELAY_NANO));
    
    updateNodeData(node.id, { 
        isExecuting: false, 
        generatedImage: 'https://picsum.photos/seed/' + node.id + '/512/512'
    });
  }

  // Find Veo Nodes
  const veoNodes = nodes.filter(n => n.type === 'veoDirector');

  for (const node of veoNodes) {
     console.log(`Executing Veo Director: ${node.id}`);
     const incomingEdges = edges.filter(e => e.target === node.id && e.sourceHandle === 'image');
     const sourceNodeId = incomingEdges[0]?.source;
     const sourceNode = nodes.find(n => n.id === sourceNodeId);
     
     if (sourceNode?.data.generatedImage) {
         await new Promise(resolve => setTimeout(resolve, DELAY_VEO));
         updateNodeData(node.id, {
             isExecuting: false,
             generatedVideo: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
         });
     } else {
         updateNodeData(node.id, { isExecuting: false });
     }
  }
}
