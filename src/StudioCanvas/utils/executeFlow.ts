import { Edge } from '@xyflow/react';
import { StudioNode } from '../types';
import { useStudioStore } from '../stores/useStudioStore';

const DELAY_NANO = 2000;
const DELAY_VEO = 4000;

export async function executeFlow() {
  const { nodes, edges, updateNodeData } = useStudioStore.getState();

  // Reset
  nodes.forEach(n => {
     if (n.type !== 'string' && n.type !== 'image') updateNodeData(n.id, { isExecuting: true, generatedImage: undefined, generatedVideo: undefined });
  });

  // Find Nano Gen Nodes
  const nanoNodes = nodes.filter(n => n.type === 'nanoGen');
  
  for (const node of nanoNodes) {
    console.log(`Executing Nano Gen: ${node.id}`);
    await new Promise(resolve => setTimeout(resolve, DELAY_NANO));
    
    // Check for inputs from edges
    const promptEdge = edges.find(e => e.target === node.id && e.targetHandle === 'prompt');
    const refImageEdges = edges.filter(e => e.target === node.id && e.targetHandle === 'ref-images');

    if (promptEdge) {
        const sourceNode = nodes.find(n => n.id === promptEdge.source);
        if (sourceNode?.data && 'value' in sourceNode.data) {
            console.log(`Using Prompt from Edge: ${sourceNode.data.value}`);
        }
    }

    if (refImageEdges.length > 0) {
        console.log(`Using ${refImageEdges.length} Reference Images`);
        refImageEdges.forEach((edge, index) => {
             const sourceNode = nodes.find(n => n.id === edge.source);
             // Logic to collect images
             console.log(`Ref Image ${index + 1}:`, sourceNode?.id);
        });
    }
    
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
     
     // Check for text prompt
     const promptEdge = edges.find(e => e.target === node.id && e.targetHandle === 'prompt-in');
     if (promptEdge) {
         const sourceNode = nodes.find(n => n.id === promptEdge.source);
         if (sourceNode?.data && 'value' in sourceNode.data) {
             console.log(`Using Veo Prompt from Edge: ${sourceNode.data.value}`);
         }
     }

     // Check for images
     const firstFrameEdge = edges.find(e => e.target === node.id && e.targetHandle === 'first-frame');
     if (firstFrameEdge) {
        const sourceNode = nodes.find(n => n.id === firstFrameEdge.source);
        // Logic to use sourceNode.data.image
     }

     const sourceNodeId = incomingEdges[0]?.source;
     const sourceNode = nodes.find(n => n.id === sourceNodeId);
     
     // Just mock execution success for now
     await new Promise(resolve => setTimeout(resolve, DELAY_VEO));
     updateNodeData(node.id, {
         isExecuting: false,
         generatedVideo: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
     });
  }
}