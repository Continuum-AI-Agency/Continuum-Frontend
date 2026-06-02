import { z } from "zod";

export const agentMentionReferenceTypeSchema = z.enum([
  "trend",
  "event",
  "question",
  "draft",
  "campaign",
  "adset",
  "link",
]);

export const agentMentionReferenceSourceSchema = z.enum(["organic", "jaina"]);

export const agentMentionReferenceSchema = z.object({
  id: z.string().min(1),
  type: agentMentionReferenceTypeSchema,
  label: z.string().min(1),
  source: agentMentionReferenceSourceSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const agentMentionMetadataSchema = z.object({
  references: z.array(agentMentionReferenceSchema).default([]),
});

export type AgentMentionReference = z.infer<typeof agentMentionReferenceSchema>;
export type AgentMentionMetadata = z.infer<typeof agentMentionMetadataSchema>;

export type AgentMentionSuggestion = {
  key: string;
  label: string;
  type: AgentMentionReference["type"];
  source: AgentMentionReference["source"];
  group?: string;
  description?: string;
  badge?: string;
  reference?: AgentMentionReference;
  childrenLabel?: string;
};

export type AgentMentionProvider = {
  getSuggestions: (input: {
    query: string;
  }) => AgentMentionSuggestion[] | Promise<AgentMentionSuggestion[]>;
  getChildSuggestions?: (
    parent: AgentMentionSuggestion
  ) => AgentMentionSuggestion[] | Promise<AgentMentionSuggestion[]>;
};

export function createMentionToken(label: string): string {
  return `@${label.trim().replace(/\s+/g, " ")}`;
}
