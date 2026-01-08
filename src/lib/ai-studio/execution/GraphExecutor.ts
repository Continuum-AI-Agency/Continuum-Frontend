import { type Edge, type Node } from "@xyflow/react";
import { type StudioNode } from "../nodeTypes";
import { resolveGeneratorInputs } from "../inputResolution";
import { createAiStudioJob } from "@/lib/api/aiStudio";

export type ExecutionStatus = "idle" | "running" | "completed" | "failed";

export type NodeExecutionResult = {
  nodeId: string;
  status: ExecutionStatus;
  output?: unknown;
  error?: string;
};

export class GraphExecutor {
  private nodes: StudioNode[];
  private edges: Edge[];
  private results: Map<string, NodeExecutionResult>;
  private onStatusChange?: (nodeId: string, status: ExecutionStatus) => void;
  private onNodeUpdate?: (nodeId: string, data: Record<string, any>) => void;

  constructor(
    nodes: StudioNode[], 
    edges: Edge[], 
    onStatusChange?: (nodeId: string, status: ExecutionStatus) => void,
    onNodeUpdate?: (nodeId: string, data: Record<string, unknown>) => void
  ) {
    this.nodes = nodes;
    this.edges = edges;
    this.results = new Map();
    this.onStatusChange = onStatusChange;
    this.onNodeUpdate = onNodeUpdate;
  }

  public async execute() {
    // 1. Handle Iterators first (Push model)
    const iterators = this.nodes.filter(n => n.type === 'iterator');
    for (const it of iterators) {
      await this.executeIterator(it.id);
    }

    // 2. Handle standalone Generators (Pull model)
    // Only run those that were not already triggered by an iterator?
    // For simplicity, we'll just run all generators that don't have an upstream iterator.
    const generators = this.nodes.filter(n => n.type === 'generator');
    const linkedGenerators = new Set<string>();
    
    // Find generators driven by iterators to skip them here
    for (const edge of this.edges) {
      if (this.nodes.find(n => n.id === edge.source)?.type === 'iterator') {
        linkedGenerators.add(edge.target);
      }
    }

    for (const gen of generators) {
      if (!linkedGenerators.has(gen.id)) {
        await this.executeGenerator(gen.id);
      }
    }
  }

  private async executeIterator(nodeId: string) {
    this.updateStatus(nodeId, "running");
    
    // Find connected Array
    const arrayEdge = this.edges.find(e => e.target === nodeId && e.targetHandle === 'array');
    if (!arrayEdge) return; // No array connected
    
    const arrayNode = this.nodes.find(n => n.id === arrayEdge.source);
    if (!arrayNode || !arrayNode.data.items) return;
    
    const items = (arrayNode.data as Record<string, unknown>).items as string[];
    
    // Find downstream nodes (e.g. Generator)
    const downstreamEdges = this.edges.filter(e => e.source === nodeId);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Update iterator state
      this.updateNodeData(nodeId, { currentIndex: i + 1, totalItems: items.length });
      
      // Trigger downstream with context
      for (const edge of downstreamEdges) {
        if (this.nodes.find(n => n.id === edge.target)?.type === 'generator') {
          await this.executeGenerator(edge.target, { variable: item });
        }
      }
    }
    
    this.updateStatus(nodeId, "completed");
  }

  private async executeGenerator(nodeId: string, context?: { variable: string }) {
    this.updateStatus(nodeId, "running");
    
    try {
      const inputs = resolveGeneratorInputs(nodeId, this.nodes, this.edges);
      
      let prompt = inputs.prompt;
      // Simple variable substitution if context exists
      if (context?.variable && prompt) {
        prompt = prompt.replace('{{item}}', context.variable); 
      }

      if (!prompt) {
        throw new Error("Missing prompt input");
      }

      // Call API
      // TODO: Pass brandProfileId from constructor or context
      const job = await createAiStudioJob({
        brandProfileId: "current-brand", 
        provider: inputs.provider,
        medium: "image", 
        prompt: prompt,
        aspectRatio: inputs.aspectRatio,
        negativePrompt: inputs.negativePrompt,
        // TODO: guidance, seed
      });

      // Update Node Data with Result
      const outputData = {
        jobId: job.id,
        status: job.status,
        artifactPreview: job.artifacts[0]?.previewUri ?? job.artifacts[0]?.uri,
        artifactName: job.artifacts[0]?.fileName,
      };
      
      this.updateNodeData(nodeId, outputData);

      // Store result internally
      this.results.set(nodeId, {
        nodeId,
        status: "completed",
        output: job
      });
      
      this.updateStatus(nodeId, "completed");
      
    } catch (error) {
      this.results.set(nodeId, {
        nodeId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
      this.updateStatus(nodeId, "failed");
    }
  }

  private updateStatus(nodeId: string, status: ExecutionStatus) {
    if (this.onStatusChange) {
      this.onStatusChange(nodeId, status);
    }
  }

  private updateNodeData(nodeId: string, data: Record<string, unknown>) {
    // Update local copy
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      node.data = { ...(node.data as Record<string, unknown>), ...data };
    }
    // Notify external subscriber (React state)
    if (this.onNodeUpdate) {
      this.onNodeUpdate(nodeId, data);
    }
  }
}