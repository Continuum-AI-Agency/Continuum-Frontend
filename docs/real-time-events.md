# Continuum Real-Time Event Boilerplate

Continuum delivers real-time UI updates through **Server-Sent Events (SSE)** so we can keep client bundles lean and continue to honor our server-first rendering strategy.

## Server Event Bus

- Location: `src/lib/server/events.ts`
- Backed by a process-level, typed event bus that wraps Node's `EventEmitter`.
- Emit an event with the helper:

  ```ts
  import { emitContinuumEvent } from "@/lib/server/events";

  emitContinuumEvent("ai.task.progress", {
    taskId: "gen-123",
    stage: "prompting",
    progress: 10,
  });
  ```

  All payloads are validated at the call site (via Zod inside server actions) so consumers receive predictable shapes.

## Server Actions

- Location: `src/app/_actions/eventBridge.ts`
- `broadcastContinuumEvent` is the generic helper that validates payloads against the shared schema before publishing to the in-app bus; feature-specific helpers (e.g., `broadcastAiTaskProgress`) call into it.
- Extend this file (or colocated server action modules) when a workflow needs to notify the front-end about progress or completion.

## Backend Adapter (Docker Service → Next.js)

- Endpoint: `POST /api/events` (same file as the SSE stream) accepts envelopes of the shape:

  ```json
  {
    "type": "ai.task.progress",
    "data": {
      "taskId": "gen-123",
      "stage": "prompting",
      "progress": 10
    }
  }
  ```

- Authentication: set `CONTINUUM_EVENT_INGEST_TOKEN` in the Next.js runtime and include that value in the Docker service's `x-continuum-event-key` header. When the env var is unset (local dev), the route accepts requests without the header.
- Validation: every envelope is parsed with the shared Zod schema (`src/lib/events/schema.ts`) before publishing, so backend events remain in lockstep with client handlers.
- Response: returns `202 Accepted` after the event is broadcast to connected SSE clients.

## SSE Route

- Endpoint: `GET /api/events` (see `src/app/api/events/route.ts`)
- Streams JSON payloads with standard SSE formatting, connection handshake (`continuum.connected`), and 25s heartbeats to keep intermediaries from closing the connection.
- Marked `dynamic = "force-dynamic"` and `runtime = "nodejs"` to prevent caching and ensure Node-compatible streaming.

## Client Consumption

- Hook: `useContinuumServerEvents` in `src/lib/sse/useContinuumServerEvents.ts`
- Usage example:

  ```tsx
  "use client";

  import { useContinuumServerEvents } from "@/lib/sse";

  export function AiProgressListener() {
    useContinuumServerEvents({
      "ai.task.progress": ({ data }) => {
        console.log("progress", data.taskId, data.stage, data.progress);
      },
    });

    return null;
  }
  ```

- The hook keeps handlers and connection options in refs to avoid unnecessary reconnects and defaults to `withCredentials = true` so Supabase sessions continue to flow through secure cookies.

## Extending the Event Map

1. Add a new event key and payload type to `src/lib/events/schema.ts`.
2. Emit from a server action or route handler using `emitContinuumEvent`.
3. Handle in the UI through `useContinuumServerEvents`.
4. Update the PRD or feature spec to explain the real-time experience.

This boilerplate ensures every feature described in `Frontend_PRD.md` can deliver real-time feedback—AI copy generation, media processing, campaign monitoring—without violating our RSC-first architecture.
