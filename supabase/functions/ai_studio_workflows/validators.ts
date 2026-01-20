import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const listSchema = z.object({
  action: z.literal("list"),
  brandProfileId: z.string().uuid(),
});

const createSchema = z.object({
  action: z.literal("create"),
  brandProfileId: z.string().uuid(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  nodes: z.array(z.unknown()).default([]),
  edges: z.array(z.unknown()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const workflowActionSchema = z.discriminatedUnion("action", [listSchema, createSchema]);

export type WorkflowAction = z.infer<typeof workflowActionSchema>;
