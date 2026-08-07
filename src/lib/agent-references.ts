import type { AgentMentionReference } from '@continuum/contracts';

export {
  type AgentDocumentAttachment,
  type AgentMentionMetadata,
  type AgentMentionReference,
  agentMentionMetadataSchema,
  agentMentionReferenceSchema,
  agentMentionReferenceSourceSchema,
  agentMentionReferenceTypeSchema,
} from '@continuum/contracts';

export type AgentMentionSuggestion = {
  key: string;
  label: string;
  type: AgentMentionReference['type'];
  source: AgentMentionReference['source'];
  group?: string;
  description?: string;
  badge?: string;
  reference?: AgentMentionReference;
  childrenLabel?: string;
  isFolder?: boolean;
  preview?: {
    url?: string | null;
    kind?: 'image' | 'video' | 'canvas';
    label?: string;
  };
};

export type AgentMentionProvider = {
  getSuggestions: (input: {
    query: string;
  }) => AgentMentionSuggestion[] | Promise<AgentMentionSuggestion[]>;
  getChildSuggestions?: (
    parent: AgentMentionSuggestion,
    query: string,
  ) => AgentMentionSuggestion[] | Promise<AgentMentionSuggestion[]>;
};

export function createMentionToken(label: string): string {
  return `@${label.trim().replace(/\s+/g, ' ')}`;
}
