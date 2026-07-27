import type {
  ClientRenderCapabilities,
  ClientRenderJob,
  ClientRenderJobKind,
} from '@continuum/contracts';

export type ClientRenderExecutorContext = {
  job: ClientRenderJob;
  leaseToken: string;
  capabilities: ClientRenderCapabilities;
  signal: AbortSignal;
  update(input: {
    state?: 'claimed' | 'rendering' | 'saving';
    progress?: number;
    phase?: string;
  }): Promise<void>;
};

export type ClientRenderExecutorResult = {
  resultAssetIds: string[];
  title: string;
  description?: string;
};

export type ClientRenderExecutor = (
  context: ClientRenderExecutorContext,
) => Promise<ClientRenderExecutorResult>;

const executors = new Map<ClientRenderJobKind, ClientRenderExecutor>();

export function registerClientRenderExecutor(
  kind: ClientRenderJobKind,
  executor: ClientRenderExecutor,
): () => void {
  executors.set(kind, executor);
  return () => {
    if (executors.get(kind) === executor) executors.delete(kind);
  };
}

export function getClientRenderExecutor(kind: ClientRenderJobKind): ClientRenderExecutor | null {
  return executors.get(kind) ?? null;
}

export function hasClientRenderExecutor(kind: ClientRenderJobKind): boolean {
  return executors.has(kind);
}
