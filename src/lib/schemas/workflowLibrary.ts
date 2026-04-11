import { z } from "zod";

const timestampSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Invalid ISO timestamp",
});

export const workflowLibraryContentSchema = z.object({
  nodes: z.array(z.unknown()).default([]),
  edges: z.array(z.unknown()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const workflowLibraryRowSchema = z.object({
  id:          z.string().min(1),
  name:        z.string().min(1),
  description: z.string().nullish(),
  content:     workflowLibraryContentSchema,
  tags:        z.array(z.string()).default([]),
  created_at:  timestampSchema,
  updated_at:  timestampSchema.nullish(),
});

export const workflowLibraryItemSchema = z.object({
  id:          z.string().min(1),
  name:        z.string().min(1),
  description: z.string().optional(),
  content:     workflowLibraryContentSchema,
  tags:        z.array(z.string()).default([]),
  createdAt:   timestampSchema,
  updatedAt:   timestampSchema.optional(),
});

export type WorkflowLibraryRow     = z.infer<typeof workflowLibraryRowSchema>;
export type WorkflowLibraryItem    = z.infer<typeof workflowLibraryItemSchema>;
export type WorkflowLibraryContent = z.infer<typeof workflowLibraryContentSchema>;

export function mapWorkflowLibraryRow(row: WorkflowLibraryRow): WorkflowLibraryItem {
  return workflowLibraryItemSchema.parse({
    id:          row.id,
    name:        row.name,
    description: row.description ?? undefined,
    content:     row.content,
    tags:        row.tags,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at ?? undefined,
  });
}
