// Response envelopes for brand-skill endpoints (Backend -> Frontend).

import { z } from "zod";
import { skillSchema } from "./skill";

export const listSkillsResponseSchema = z
  .object({
    skills: z.array(skillSchema),
  })
  .strict();
export type ListSkillsResponse = z.infer<typeof listSkillsResponseSchema>;

export const skillResponseSchema = z
  .object({
    skill: skillSchema,
  })
  .strict();
export type SkillResponse = z.infer<typeof skillResponseSchema>;
