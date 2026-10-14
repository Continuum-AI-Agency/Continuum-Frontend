'use client';

// The browser's half of a Fast Cut run: ask the Backend to cut the node it holds in the SAVED
// room. The cut itself is server-side (one implementation, shared with server canvas runs) —
// the browser never plans or encodes a montage.

import {
  CANVAS_FAST_CUT_ROUTE,
  type CanvasFastCutRequest,
  type CanvasFastCutResponse,
  canvasFastCutRequestSchema,
  canvasFastCutResponseSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

export async function runFastCutNode(
  input: CanvasFastCutRequest,
  signal?: AbortSignal,
): Promise<CanvasFastCutResponse> {
  return http.request({
    path: CANVAS_FAST_CUT_ROUTE,
    method: 'POST',
    body: canvasFastCutRequestSchema.parse(input),
    schema: canvasFastCutResponseSchema,
    // The bound is the client policy's render class (lib/api/timeout.ts), chosen by this URL.
    signal,
  });
}
