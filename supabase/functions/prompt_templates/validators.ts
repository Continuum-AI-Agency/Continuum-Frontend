import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const listSchema = z.object({
  action: z.literal("list"),
  brandProfileId: z.string().uuid(),
  query: z.string().trim().optional(),
});

const createSchema = z.object({
  action: z.literal("create"),
  brandProfileId: z.string().uuid(),
  name: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  category: z.string().trim().min(1).optional(),
});

const updateSchema = z
  .object({
    action: z.literal("update"),
    id: z.string().uuid(),
    name: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.name || value.prompt || value.category), {
    message: "At least one field is required",
  });

const deleteSchema = z.object({
  action: z.literal("delete"),
  id: z.string().uuid(),
});

export const promptTemplateActionSchema = z.discriminatedUnion("action", [
  listSchema,
  createSchema,
  updateSchema,
  deleteSchema,
]);

export type PromptTemplateAction = z.infer<typeof promptTemplateActionSchema>;
