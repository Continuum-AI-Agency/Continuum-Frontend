'use client';

import {
  type AgentRunDto,
  type AgentRunEventDto,
  hyperframesAgentEventSchema,
} from '@continuum/contracts';

type PendingWork =
  | {
      kind: 'review';
      key: string;
      revisionId: string;
      fingerprint: string;
      timestampsSeconds: number[];
    }
  | {
      kind: 'render';
      key: string;
      revisionId: string;
      fingerprint: string;
    };

const eventData = (event: AgentRunEventDto): Record<string, unknown> => event.data;

export function resolvePendingHyperframesWork(events: AgentRunEventDto[]): PendingWork | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    const parsed = hyperframesAgentEventSchema.safeParse({
      type: event.type,
      data: event.data,
    });
    if (!parsed.success) continue;
    if (parsed.data.type === 'hyperframes.render.requested') {
      const revisionId = parsed.data.data.revisionId;
      const completed = events
        .slice(index + 1)
        .some(
          (candidate) =>
            candidate.type === 'hyperframes.render.completed' &&
            eventData(candidate).revisionId === revisionId,
        );
      if (!completed) {
        return {
          kind: 'render',
          key: `render:${parsed.data.data.revisionId}:${parsed.data.data.fingerprint}`,
          revisionId: parsed.data.data.revisionId,
          fingerprint: parsed.data.data.fingerprint,
        };
      }
    }
    if (parsed.data.type === 'hyperframes.visual_review.requested') {
      const revisionId = parsed.data.data.revisionId;
      const pass = parsed.data.data.pass;
      const completed = events
        .slice(index + 1)
        .some(
          (candidate) =>
            candidate.type === 'hyperframes.visual_review.completed' &&
            eventData(candidate).revisionId === revisionId &&
            eventData(candidate).pass === pass,
        );
      if (!completed) {
        return {
          kind: 'review',
          key: `review:${parsed.data.data.revisionId}:${parsed.data.data.pass}`,
          revisionId: parsed.data.data.revisionId,
          fingerprint: parsed.data.data.fingerprint,
          timestampsSeconds: parsed.data.data.timestampsSeconds,
        };
      }
    }
  }
  return null;
}

export function HyperframesRunWorker({ run: _run }: { run: AgentRunDto }) {
  // Browser work is intentionally not started by observing an agent event.
  // The Backend projects the run into media.client_render_jobs; an operator
  // explicitly claims it from the shared Ready to render inbox.
  return null;
}
