import {
  type PresentationEngineRequest,
  type PresentationEngineResponse,
  presentationEngineRequestSchema,
  presentationEngineResponseSchema,
} from '@continuum/contracts';
import { z } from 'zod';

const workerReplySchema = z.object({
  id: z.number().int(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

/** Runs the pinned native engine in a worker so rendering cannot block editor input. */
export class PresentationEngine {
  private readonly worker: Worker;
  private sequence = 0;
  private version: Promise<string> | null = null;
  private failed: Error | null = null;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor() {
    this.worker = new Worker('/forge/presentations/worker.js', { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = workerReplySchema.safeParse(event.data);
      if (!parsed.success)
        return this.failAll(new Error('The presentation engine returned an invalid response.'));
      const reply = parsed.data;
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(reply.id);
      if (reply.error) pending.reject(new Error(reply.error));
      else pending.resolve(reply.result);
    };
    this.worker.onerror = () =>
      this.failAll(new Error('The presentation engine could not load. Refresh to try again.'));
  }

  async process(request: PresentationEngineRequest): Promise<PresentationEngineResponse> {
    if (this.failed) throw this.failed;
    const parsedRequest = presentationEngineRequestSchema.safeParse(request);
    if (!parsedRequest.success)
      throw new Error(
        'This presentation uses an incompatible format. Reload Forge before editing.',
      );
    const body = parsedRequest.data;
    if (body.document) {
      this.version ??= this.process({ operation: 'capabilities' }).then((result) => {
        if (!result.ok || !result.engineVersion)
          throw new Error('The presentation engine did not report its version.');
        return result.engineVersion;
      });
      if ((await this.version) !== body.document.engineVersion)
        throw new Error(
          'The browser and server presentation engines do not match. Refresh before editing this deck.',
        );
    }
    const id = ++this.sequence;
    const response = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The presentation engine timed out. Your saved document is unchanged.'));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ id, request: body });
    });
    const parsed = presentationEngineResponseSchema.safeParse(response);
    if (!parsed.success)
      throw new Error(
        'The presentation engine returned an invalid document. Refresh and try again.',
      );
    if (!parsed.data.ok) throw new Error(parsed.data.error.message);
    return parsed.data;
  }

  dispose() {
    this.worker.terminate();
    this.failAll(new Error('The presentation workspace was closed.'));
  }

  private failAll(error: Error) {
    this.failed = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
