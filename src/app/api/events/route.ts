import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  emitContinuumEvent,
  subscribeToContinuumEvents,
} from "@/lib/server/events";
import {
  continuumEventNameSchema,
  getContinuumEventSchema,
  type ContinuumEvent,
} from "@/lib/events/schema";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  Connection: "keep-alive",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

const encoder = new TextEncoder();

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ingestEnvelopeSchema = z
  .object({
    type: continuumEventNameSchema,
    data: z.unknown(),
    id: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .strict();

function serializeEvent(event: ContinuumEvent) {
  const payload = JSON.stringify({
    ...event.data,
    timestamp: event.timestamp,
  });

  const fields = [
    event.id ? `id: ${event.id}` : null,
    `event: ${event.type}`,
    `data: ${payload}`,
  ].filter(Boolean);

  return `${fields.join("\n")}\n\n`;
}

function createHandshake() {
  return encoder.encode(
    [
      "retry: 10000",
      "event: continuum.connected",
      `data: ${JSON.stringify({ timestamp: new Date().toISOString() })}`,
      "",
    ].join("\n")
  );
}

function createKeepAlive() {
  return encoder.encode(
    [
      "event: continuum.keepalive",
      `data: ${JSON.stringify({ timestamp: new Date().toISOString() })}`,
      "",
    ].join("\n")
  );
}

export function GET(request: NextRequest) {
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const handleAbort = () => {
        cleanup?.();
        controller.close();
      };

      request.signal.addEventListener("abort", handleAbort);

      controller.enqueue(createHandshake());

      const unsubscribe = subscribeToContinuumEvents((event) => {
        controller.enqueue(encoder.encode(serializeEvent(event)));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(createKeepAlive());
      }, 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", handleAbort);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new NextResponse(stream, { headers: SSE_HEADERS });
}

function validateIngestToken(request: NextRequest) {
  const configuredToken = process.env.CONTINUUM_EVENT_INGEST_TOKEN;
  if (!configuredToken) return true;

  const providedToken = request.headers.get("x-continuum-event-key");
  return providedToken === configuredToken;
}

export async function POST(request: NextRequest) {
  if (!validateIngestToken(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parseResult = ingestEnvelopeSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid event envelope",
        issues: parseResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { type, data, id, timestamp } = parseResult.data;
  const schema = getContinuumEventSchema(type);
  const validatedPayload = schema.parse(data);

  emitContinuumEvent(type, validatedPayload, { id, timestamp });

  return new NextResponse(null, { status: 202 });
}
