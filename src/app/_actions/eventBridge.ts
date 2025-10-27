"use server";

import {
  getContinuumEventSchema,
  type ContinuumEventName,
  type ContinuumEventMap,
} from "@/lib/events/schema";
import { emitContinuumEvent } from "@/lib/server/events";

export async function broadcastContinuumEvent<K extends ContinuumEventName>(
  type: K,
  input: unknown
) {
  const schema = getContinuumEventSchema(type);
  const payload = schema.parse(input) as ContinuumEventMap[K];
  emitContinuumEvent(type, payload);
}

export async function broadcastAiTaskProgress(
  input: ContinuumEventMap["ai.task.progress"]
) {
  await broadcastContinuumEvent("ai.task.progress", input);
}

export async function broadcastAiTaskCompletion(
  input: ContinuumEventMap["ai.task.completed"]
) {
  await broadcastContinuumEvent("ai.task.completed", input);
}
