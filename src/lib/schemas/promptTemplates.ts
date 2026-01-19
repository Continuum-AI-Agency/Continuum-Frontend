import { z } from "zod";

const templateSourceSchema = z.enum(["custom", "preset"]);

const timestampSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Invalid ISO timestamp",
});

export const promptTemplateRowSchema = z.object({
  id: z.string().uuid(),
  brand_profile_id: z.string().uuid(),
  name: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  category: z.string().trim().min(1),
  source: templateSourceSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export type PromptTemplateRow = z.infer<typeof promptTemplateRowSchema>;

export type PromptTemplate = {
  id: string;
  brandProfileId: string;
  name: string;
  prompt: string;
  category: string;
  source: z.infer<typeof templateSourceSchema>;
  createdAt: string;
  updatedAt: string;
};

export function mapPromptTemplateRow(row: PromptTemplateRow): PromptTemplate {
  return {
    id: row.id,
    brandProfileId: row.brand_profile_id,
    name: row.name,
    prompt: row.prompt,
    category: row.category,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const promptTemplateListSchema = z.object({
  brandProfileId: z.string().uuid(),
  query: z.string().trim().optional(),
});

export const promptTemplateCreateSchema = z.object({
  brandProfileId: z.string().uuid(),
  name: z.string().trim().min(1, "Template name is required").max(120, "Name is too long"),
  prompt: z.string().trim().min(1, "Prompt is required").max(5000, "Prompt is too long"),
  category: z.string().trim().min(1).max(80).optional(),
});

export const promptTemplateUpdateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    prompt: z.string().trim().min(1).max(5000).optional(),
    category: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => Boolean(value.name || value.prompt || value.category), {
    message: "At least one field is required",
  });

export type PromptTemplateListInput = z.infer<typeof promptTemplateListSchema>;
export type PromptTemplateCreateInput = z.infer<typeof promptTemplateCreateSchema>;
export type PromptTemplateUpdateInput = z.infer<typeof promptTemplateUpdateSchema>;
