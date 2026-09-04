'use client';

import { type OmniGenRequest, omniGenStreamFrameSchema } from '@continuum/contracts';
import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiUrl } from '@/lib/api/config';
import { authedSseHeaders } from '@/lib/api/sseHeaders';
import { readServerSentEvents } from '@/lib/sse/readServerSentEvents';
import type {
  BackendChatImageRequestPayload,
  BackendExtendVideoRequestPayload,
  StreamState,
} from '@/lib/types/chatImage';
import type { ImageOutputItem, NodeOutput } from '../types/execution';
import { parseDataUrl } from '../utils/dataUrl';
import { generationErrorCopy } from '../utils/generationErrorCopy';
import { resolveWorkflowInitUrl } from './resolveWorkflowInitUrl';

export type OmniTurnResult = {
  success: boolean;
  error?: string;
  interactionId?: string;
  output?: { type: 'video'; url: string; storagePath?: string; storageBucket?: string };
  assetId?: string | null;
  durationSec?: number | null;
};

type ExecutionStreamState = StreamState & {
  currentNodeId?: string;
};

type ExecutionResult = {
  success: boolean;
  output?: NodeOutput;
  error?: string;
  /** The Backend's classification of the failure, when it sent one. */
  errorCode?: string;
};

export function useWorkflowExecution() {
  const [streamState, setStreamState] = useState<ExecutionStreamState>({ status: 'idle' });
  const activeControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeReadersRef = useRef<Map<string, ReadableStreamDefaultReader<Uint8Array>>>(new Map());
  const isCancelledRef = useRef(false);
  const { show } = useToast();

  const resolveInitUrl = useCallback((path: string) => {
    return resolveWorkflowInitUrl({
      path,
      hasWindow: typeof window !== 'undefined',
      windowOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
      clientApiBase: process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
      getApiUrl,
    });
  }, []);

  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    for (const controller of activeControllersRef.current.values()) {
      controller.abort();
    }
    for (const reader of activeReadersRef.current.values()) {
      reader.cancel().catch(() => {});
    }
    activeControllersRef.current.clear();
    activeReadersRef.current.clear();
    setStreamState((prev) => ({ ...prev, status: 'idle' }));
  }, []);

  const reset = useCallback(() => {
    isCancelledRef.current = false;
    activeControllersRef.current.clear();
    activeReadersRef.current.clear();
    setStreamState({ status: 'idle' });
  }, []);

  const registerController = useCallback((nodeId: string): AbortController => {
    const existing = activeControllersRef.current.get(nodeId);
    if (existing) {
      existing.abort();
    }
    const controller = new AbortController();
    activeControllersRef.current.set(nodeId, controller);
    return controller;
  }, []);

  const releaseController = useCallback((nodeId: string, controller: AbortController) => {
    if (activeControllersRef.current.get(nodeId) === controller) {
      activeControllersRef.current.delete(nodeId);
    }
  }, []);

  const executeStreamRequest = useCallback(
    async (
      nodeId: string,
      payload: unknown,
      initUrl: string,
      expectedMedium: 'image' | 'video' | 'text',
      onPartialUpdate?: (data: any) => void,
      onOutputAvailable?: (output: NodeOutput) => void,
    ): Promise<ExecutionResult> => {
      if (isCancelledRef.current) {
        return { success: false, error: 'Execution cancelled' };
      }

      setStreamState({ status: 'starting', currentNodeId: nodeId });

      const controller = new AbortController();
      activeControllersRef.current.set(nodeId, controller);

      let jobId: string | undefined;
      try {
        const res = await fetch(initUrl, {
          method: 'POST',
          headers: await authedSseHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.text();
          const msg = body.includes('<!DOCTYPE')
            ? 'API endpoint returned HTML (likely 404). Check API base URL.'
            : body;
          throw new Error(`API request failed: ${res.status} - ${msg.slice(0, 200)}`);
        }

        setStreamState({ status: 'streaming', progressPct: 0, currentNodeId: nodeId });

        const reader = res.body.getReader();
        activeReadersRef.current.set(nodeId, reader);
        const decoder = new TextDecoder();
        let buffer = '';
        let finalOutput: NodeOutput | undefined;
        // Held locally, NOT read back off streamState: this callback closes over the
        // streamState of the render that created it, so the post-stream check below
        // never saw the error it had just set and reported every backend failure as
        // "No output received from generation".
        let streamError: { message: string; code?: string } | undefined;
        // Sparse by design: keyed on the variation index the Backend stamps, so an
        // out-of-order or partially-failed batch still lands each image in its own slot.
        const imageVariations: Array<ImageOutputItem | undefined> = [];

        const processChunk = (chunk: string) => {
          const events = chunk.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? '';

          for (const evt of events) {
            let eventName: string | undefined;
            const dataLines: string[] = [];
            for (const rawLine of evt.split(/\r?\n/)) {
              const line = rawLine.replace(/\r$/, '');
              if (line.startsWith('event:')) {
                eventName = line.replace(/^event:\s*/, '').trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.replace(/^data:\s*/, ''));
              }
            }
            if (!dataLines.length) continue;
            const jsonStr = dataLines.join('');

            try {
              type StreamPayload = {
                jobId?: string;
                phase?: string;
                pct?: number;
                etaMs?: number;
                base64?: string;
                data_url?: string;
                bytes?: string;
                mime_type?: string;
                signed_url?: string;
                signedUrl?: string;
                download_url?: string;
                url?: string;
                video_url?: string;
                poster_base64?: string;
                size_bytes?: number;
                storage?: { signed_url?: string; size_bytes?: number };
                path?: string;
                storagePath?: string;
                bucket?: string;
                mimeType?: string;
                message?: string;
                code?: string;
                retryable?: boolean;
                text?: string;
                delta?: string;
                progress?: number;
                asset_id?: string;
                asset_version_id?: string;
                variation_index?: number;
                delivery?: 'durable' | 'fallback';
              };

              const parsed = JSON.parse(jsonStr) as StreamPayload;
              if (parsed.jobId) jobId = parsed.jobId;

              if (eventName === 'progress') {
                setStreamState((prev) => ({
                  ...prev,
                  status: 'streaming',
                  progressPct: parsed.pct ?? parsed.progress ?? prev.progressPct ?? 0,
                  etaMs: parsed.etaMs,
                }));
              }

              const rawImageValue = parsed.base64 ?? parsed.data_url ?? parsed.bytes;
              const rawImageString = typeof rawImageValue === 'string' ? rawImageValue : undefined;
              const parsedImage = rawImageString?.startsWith('data:')
                ? parseDataUrl(rawImageString)
                : null;
              const imageBase64 =
                parsedImage?.base64 ??
                (rawImageString
                  ? rawImageString.replace(/^data:image\/[^;]+;base64,/, '')
                  : undefined);
              const normalizedImageBase64 = imageBase64
                ? imageBase64.replace(/\s+/g, '')
                : undefined;
              const imageMimeType = parsedImage?.mimeType ?? parsed.mime_type ?? 'image/png';
              const imageUrl =
                typeof parsed.signed_url === 'string'
                  ? parsed.signed_url
                  : typeof parsed.signedUrl === 'string'
                    ? parsed.signedUrl
                    : typeof parsed.storage?.signed_url === 'string'
                      ? parsed.storage?.signed_url
                      : typeof parsed.download_url === 'string'
                        ? parsed.download_url
                        : typeof parsed.url === 'string'
                          ? parsed.url
                          : undefined;
              const persistentImageUrl =
                imageUrl && !imageUrl.startsWith('data:') ? imageUrl : undefined;
              const sizeBytes =
                typeof parsed.size_bytes === 'number'
                  ? parsed.size_bytes
                  : typeof parsed.storage?.size_bytes === 'number'
                    ? parsed.storage.size_bytes
                    : undefined;

              if (eventName === 'image' && (normalizedImageBase64 || persistentImageUrl)) {
                console.info('[studio] image event received', {
                  nodeId,
                  mimeType: imageMimeType,
                  base64Length: normalizedImageBase64?.length ?? 0,
                  hasUrl: Boolean(persistentImageUrl),
                });
                if (expectedMedium === 'image') {
                  // URL-first: the signed URL is the source of truth; base64 is
                  // present only on the upload/sign fallback path.
                  const item: ImageOutputItem = {
                    base64: normalizedImageBase64,
                    mimeType: imageMimeType,
                    url: persistentImageUrl,
                    storagePath: typeof parsed.path === 'string' ? parsed.path : undefined,
                    storageBucket: typeof parsed.bucket === 'string' ? parsed.bucket : undefined,
                    sizeBytes,
                    assetId: typeof parsed.asset_id === 'string' ? parsed.asset_id : undefined,
                    assetVersionId:
                      typeof parsed.asset_version_id === 'string'
                        ? parsed.asset_version_id
                        : undefined,
                  };
                  // A num_images run emits one event per variation, each tagged
                  // with its index. Absent means a plain single-image generation.
                  imageVariations[parsed.variation_index ?? 0] = item;
                  finalOutput = { type: 'image', ...item };
                  onOutputAvailable?.(finalOutput);
                }
              }

              if (eventName === 'text' || eventName === 'message') {
                const delta = parsed.delta ?? parsed.text;
                if (delta && onPartialUpdate) {
                  onPartialUpdate({ delta });
                }
                if (expectedMedium === 'text' && delta) {
                  // Accumulate for final output if needed, though usually stream is sufficient
                  if (!finalOutput) finalOutput = { type: 'text', value: '' };
                  (finalOutput as any).value += delta;
                }
              }

              const videoMime = parsed.mime_type ?? parsed.mimeType ?? 'video/mp4';
              const rawVideoString =
                typeof parsed.signed_url === 'string'
                  ? parsed.signed_url
                  : typeof parsed.signedUrl === 'string'
                    ? parsed.signedUrl
                    : typeof parsed.storage?.signed_url === 'string'
                      ? parsed.storage?.signed_url
                      : typeof parsed.download_url === 'string'
                        ? parsed.download_url
                        : typeof parsed.url === 'string'
                          ? parsed.url
                          : typeof parsed.video_url === 'string'
                            ? parsed.video_url
                            : typeof parsed.data_url === 'string'
                              ? parsed.data_url
                              : typeof parsed.bytes === 'string'
                                ? `data:${videoMime};base64,${parsed.bytes}`
                                : typeof parsed.base64 === 'string'
                                  ? `data:${videoMime};base64,${parsed.base64}`
                                  : undefined;
              const videoUrl = rawVideoString;

              // On a variation run each `image` event already carries its own storage
              // coordinates; `stored` describes only the primary, so folding it in would
              // overwrite the last variation with variation 0's path.
              if (
                eventName === 'stored' &&
                expectedMedium === 'image' &&
                finalOutput?.type === 'image' &&
                imageVariations.filter(Boolean).length <= 1
              ) {
                finalOutput = {
                  ...finalOutput,
                  url: parsed.signed_url ?? parsed.storage?.signed_url ?? finalOutput.url,
                  storagePath: parsed.path,
                  storageBucket: parsed.bucket,
                  sizeBytes: sizeBytes ?? finalOutput.sizeBytes,
                };
              }

              if ((eventName === 'video' || eventName === 'stored') && videoUrl) {
                if (expectedMedium !== 'video') {
                  // continue, not return: an image generation's `stored` event carries a
                  // signed_url and lands here, and returning abandoned every event
                  // batched behind it in the same chunk — usually `complete`.
                  continue;
                }
                finalOutput = {
                  type: 'video',
                  url: videoUrl,
                  posterBase64: parsed.poster_base64,
                  storagePath: parsed.path ?? parsed.storagePath,
                  storageBucket: parsed.bucket,
                  sizeBytes,
                };
              }

              if (eventName === 'complete' && !finalOutput) {
                if (expectedMedium === 'image' && (normalizedImageBase64 || persistentImageUrl)) {
                  finalOutput = {
                    type: 'image',
                    base64: normalizedImageBase64,
                    mimeType: imageMimeType,
                    url: persistentImageUrl,
                    storagePath: typeof parsed.path === 'string' ? parsed.path : undefined,
                    storageBucket: typeof parsed.bucket === 'string' ? parsed.bucket : undefined,
                    sizeBytes,
                    assetId: typeof parsed.asset_id === 'string' ? parsed.asset_id : undefined,
                    assetVersionId:
                      typeof parsed.asset_version_id === 'string'
                        ? parsed.asset_version_id
                        : undefined,
                  };
                } else if (expectedMedium === 'video' && videoUrl) {
                  finalOutput = {
                    type: 'video',
                    url: videoUrl,
                    posterBase64: parsed.poster_base64,
                  };
                }
              }

              if (
                eventName === 'complete' &&
                finalOutput?.type === 'image' &&
                typeof parsed.asset_id === 'string'
              ) {
                // Both halves, or the node holds a Library identity it cannot pin with.
                finalOutput = {
                  ...finalOutput,
                  assetId: parsed.asset_id,
                  ...(typeof parsed.asset_version_id === 'string'
                    ? { assetVersionId: parsed.asset_version_id }
                    : {}),
                };
              }

              if (eventName === 'complete' && expectedMedium === 'image') {
                const variations = imageVariations.filter(
                  (item): item is ImageOutputItem => item !== undefined,
                );
                // Exactly one image stays the `image` output every downstream consumer
                // already handles; only a genuine multi-variation run changes shape.
                if (variations.length > 1) {
                  finalOutput = { type: 'images', items: variations };
                  onOutputAvailable?.(finalOutput);
                }
              }

              if (eventName === 'error') {
                const message = parsed.message ?? 'Stream error';
                streamError = { message, code: parsed.code };
                setStreamState((prev) => ({ ...prev, status: 'error', error: message }));
                const copy = generationErrorCopy(parsed.code, message);
                show({ title: copy.title, description: copy.guidance, variant: 'error' });
              }

              if (eventName === 'complete') {
                setStreamState((prev) => ({
                  ...prev,
                  status: 'done',
                  progressPct: 100,
                }));
              }
            } catch (err) {
              console.error('Failed to parse SSE message', err, jsonStr.slice(0, 200));
            }
          }
        };

        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim().length) {
              processChunk(buffer + '\n\n');
              buffer = '';
            }
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          processChunk(buffer);
          await pump();
        };

        await pump().catch((err) => {
          console.error('Stream read failed', err);
        });

        if (isCancelledRef.current) {
          return { success: false, error: 'Execution cancelled' };
        }

        if (finalOutput) {
          console.info('[studio] executeGeneration returning output', {
            nodeId,
            type: finalOutput.type,
          });
          return { success: true, output: finalOutput };
        }

        if (streamError) {
          return { success: false, error: streamError.message, errorCode: streamError.code };
        }

        return { success: false, error: 'No output received from generation' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Generation failed', message);
        setStreamState({ status: 'error', error: message, currentNodeId: nodeId });
        if (!isCancelledRef.current) {
          const description = message.includes('Failed to fetch')
            ? 'Unable to reach the AI Studio API. Check your API base URL and that the backend is running.'
            : message;
          show({
            title: 'Generation failed',
            description,
            variant: 'error',
          });
        }
        return { success: false, error: message };
      } finally {
        activeControllersRef.current.delete(nodeId);
        activeReadersRef.current.delete(nodeId);
      }
    },
    [show],
  );

  const executeGeneration = useCallback(
    async (
      nodeId: string,
      payload: BackendChatImageRequestPayload,
      onOutputAvailable?: (output: NodeOutput) => void,
    ): Promise<ExecutionResult> => {
      const expectedMedium = payload.medium;
      const initUrl =
        payload.medium === 'video'
          ? resolveInitUrl('/ai-studio/generate-video')
          : resolveInitUrl('/ai-studio/generate');

      return executeStreamRequest(
        nodeId,
        payload,
        initUrl,
        expectedMedium,
        undefined,
        onOutputAvailable,
      );
    },
    [resolveInitUrl, executeStreamRequest],
  );

  const executeVideoExtension = useCallback(
    async (nodeId: string, payload: BackendExtendVideoRequestPayload): Promise<ExecutionResult> => {
      const initUrl = resolveInitUrl('/ai-studio/extend-video');
      return executeStreamRequest(nodeId, payload, initUrl, 'video');
    },
    [resolveInitUrl, executeStreamRequest],
  );

  const executeEnrichment = useCallback(
    async (
      nodeId: string,
      payload: any,
      onPartialUpdate?: (data: any) => void,
    ): Promise<ExecutionResult> => {
      const initUrl = resolveInitUrl('/api/ai-studio/enrich');
      return executeStreamRequest(nodeId, payload, initUrl, 'text', onPartialUpdate);
    },
    [resolveInitUrl, executeStreamRequest],
  );

  // Gemini Omni Flash generate/edit turn. Calls the backend AI Studio route
  // (/ai-studio/generate-video-omni) so it shares the same grounding + save +
  // media.assets registration flow as the other video generators. Reads SSE
  // frames and surfaces BOTH the produced video AND the interaction id the node
  // persists to thread the next edit. Each frame is validated against the shared
  // contract before use.
  const executeOmniTurn = useCallback(
    async (
      nodeId: string,
      payload: OmniGenRequest,
      handlers?: { onProgress?: (pct: number, phase?: string) => void },
    ): Promise<OmniTurnResult> => {
      const controller = registerController(nodeId);
      setStreamState({ status: 'starting', currentNodeId: nodeId });
      try {
        const response = await fetch(resolveInitUrl('/ai-studio/generate-video-omni'), {
          method: 'POST',
          headers: await authedSseHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.text();
          return { success: false, error: err || `Omni request failed (${response.status})` };
        }
        const reader = response.body?.getReader();
        if (!reader) return { success: false, error: 'No response body' };
        activeReadersRef.current.set(nodeId, reader);
        setStreamState({ status: 'streaming', progressPct: 0, currentNodeId: nodeId });

        let interactionId: string | undefined;
        let output: OmniTurnResult['output'];
        let assetId: string | null | undefined;
        let durationSec: number | null | undefined;
        let streamError: string | undefined;

        await readServerSentEvents({
          reader,
          onEvent: (eventName, data) => {
            const text = data.trimStart();
            let raw: unknown;
            try {
              raw = JSON.parse(text);
            } catch {
              return;
            }
            const frame = omniGenStreamFrameSchema.safeParse({ type: eventName, data: raw });
            if (!frame.success) return;
            const f = frame.data;
            if (f.type === 'progress') {
              handlers?.onProgress?.(f.data.pct ?? 0, f.data.phase);
              setStreamState((prev) => ({
                ...prev,
                status: 'streaming',
                progressPct: f.data.pct ?? prev.progressPct,
              }));
            } else if (f.type === 'interaction') {
              interactionId = f.data.interactionId;
            } else if (f.type === 'video') {
              output = {
                type: 'video',
                url: f.data.signedUrl,
                storagePath: f.data.storagePath,
                storageBucket: f.data.bucket,
              };
              assetId = f.data.assetId ?? null;
              durationSec = f.data.durationSec ?? null;
              if (!interactionId && f.data.interactionId) interactionId = f.data.interactionId;
            } else if (f.type === 'error') {
              streamError = f.data.message;
            }
          },
        });

        setStreamState((prev) => ({ ...prev, status: 'done', progressPct: 100 }));

        if (streamError) {
          show({ title: 'Omni generation failed', description: streamError, variant: 'error' });
          return { success: false, error: streamError, interactionId };
        }
        if (!output) {
          return { success: false, error: 'No video returned from Omni', interactionId };
        }
        return { success: true, output, interactionId, assetId, durationSec };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isCancelledRef.current) {
          show({ title: 'Omni generation failed', description: message, variant: 'error' });
        }
        setStreamState({ status: 'error', error: message, currentNodeId: nodeId });
        return { success: false, error: message };
      } finally {
        activeReadersRef.current.delete(nodeId);
        releaseController(nodeId, controller);
      }
    },
    [resolveInitUrl, registerController, releaseController, show],
  );

  return {
    streamState,
    executeGeneration,
    executeVideoExtension,
    executeEnrichment,
    executeOmniTurn,
    cancel,
    reset,
    registerController,
    releaseController,
    show,
  };
}
