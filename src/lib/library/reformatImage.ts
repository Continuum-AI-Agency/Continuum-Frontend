import {
  type ImageReformatEvent,
  type ImageReformatRequest,
  imageReformatEventSchema,
  imageReformatRequestSchema,
} from '@continuum/contracts';

import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

const REFORMAT_PATH = '/api/ai-studio/reformat-image';

export class ReformatRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ReformatRequestError';
  }
}

export function parseReformatEventLine(line: string): ImageReformatEvent | null {
  if (!line.startsWith('data:')) return null;
  try {
    const parsed = imageReformatEventSchema.safeParse(JSON.parse(line.slice(5).trim()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function runImageReformat(input: {
  request: ImageReformatRequest;
  signal?: AbortSignal;
  onEvent?(event: ImageReformatEvent): void;
}): Promise<Extract<ImageReformatEvent, { type: 'reformat.completed' }>> {
  const request = imageReformatRequestSchema.parse(input.request);
  const token = await getBrowserAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${REFORMAT_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal: input.signal,
  });
  if (!response.ok) {
    throw new ReformatRequestError(
      response.status === 401
        ? 'Sign in again to reformat this image'
        : response.status === 403
          ? 'You do not have access to reformat this image'
          : `Image reformat failed (${response.status})`,
    );
  }
  if (!response.body)
    throw new ReformatRequestError('The reformat stream did not start', undefined, true);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: Extract<ImageReformatEvent, { type: 'reformat.completed' }> | null = null;

  const consumeBlock = (block: string): void => {
    for (const line of block.split('\n')) {
      const event = parseReformatEventLine(line.trim());
      if (!event) continue;
      input.onEvent?.(event);
      if (event.type === 'reformat.failed') {
        throw new ReformatRequestError(event.data.message, event.data.code, event.data.retryable);
      }
      if (event.type === 'reformat.completed') completed = event;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) consumeBlock(block);
    if (done) break;
  }
  if (buffer.trim()) consumeBlock(buffer);
  if (!completed)
    throw new ReformatRequestError('The reformat ended without an image', undefined, true);
  return completed;
}
