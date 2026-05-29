import type { z } from "zod";
import type { StreamEnvelope } from "./envelope";

export type StreamFrame = { type: string; data?: unknown };

export const serializeFrame = (
  frame: StreamFrame,
  envelope: StreamEnvelope,
): string => `${JSON.stringify({ ...frame, ...envelope })}\n`;

export const parseFrame = <TSchema extends z.ZodTypeAny>(
  line: string,
  schema: TSchema,
): z.infer<TSchema> | null => {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
};
