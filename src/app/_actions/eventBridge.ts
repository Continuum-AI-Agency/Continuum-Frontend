"use server";

import { z } from "zod";

import {
  continuumEventPayloadSchemas,
  type ContinuumEventName,
} from "@/lib/events/schema";
import { emitContinuumEvent } from "@/lib/server/events";

type ContinuumEventSchemaMap = typeof continuumEventPayloadSchemas;

export async function broadcastContinuumEvent<K extends ContinuumEventName>(
  type: K,
  input: z.input<ContinuumEventSchemaMap[K]>
) {
  const payload = continuumEventPayloadSchemas[type].parse(input);

  emitContinuumEvent(type, payload);
}

export async function broadcastAiTaskProgress(
  input: z.input<ContinuumEventSchemaMap["ai.task.progress"]>
) {
  await broadcastContinuumEvent("ai.task.progress", input);
}

export async function broadcastAiTaskCompletion(
  input: z.input<ContinuumEventSchemaMap["ai.task.completed"]>
) {
  await broadcastContinuumEvent("ai.task.completed", input);
}
