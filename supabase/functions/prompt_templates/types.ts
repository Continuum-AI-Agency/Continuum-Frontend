export type PromptTemplateRow = {
  id: string;
  brand_profile_id: string;
  name: string;
  prompt: string;
  category: string;
  source: "custom" | "preset";
  created_at: string;
  updated_at: string;
};
