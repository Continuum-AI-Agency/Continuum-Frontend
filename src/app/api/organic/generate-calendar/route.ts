import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiUrl } from '@/lib/api/config';
import {
  backendCalendarGenerationRequestSchema,
  calendarGenerationRequestSchema,
  toBackendCalendarGenerationRequest,
} from '@/lib/organic/calendar-generation';
import { getPostHogClient } from '@/lib/posthog-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsedRequest = calendarGenerationRequestSchema.safeParse(json);
  const parsedBackendRequest = backendCalendarGenerationRequestSchema.safeParse(json);
  if (!parsedRequest.success && !parsedBackendRequest.success) {
    return NextResponse.json(
      {
        error: 'Invalid calendar generation payload',
        detail: {
          calendar: parsedRequest.error.flatten(),
          backend: parsedBackendRequest.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const distinctId = session.user?.id ?? session.user?.email ?? 'anonymous';
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId,
    event: 'organic_calendar_generated',
    properties: {
      brand_profile_id: parsedBackendRequest.success
        ? parsedBackendRequest.data.brandProfileId
        : parsedRequest.success
          ? parsedRequest.data.brandProfileId
          : null,
    },
  });
  posthog.shutdown().catch(() => {});

  const token = session.access_token.trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  const backendUrl = getApiUrl('/api/organic/generate-calendar');
  let payload;
  if (parsedBackendRequest.success) {
    payload = parsedBackendRequest.data;
  } else {
    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          error: 'Invalid calendar generation payload',
          detail: 'Unable to normalize request payload.',
        },
        { status: 400 },
      );
    }
    try {
      payload = toBackendCalendarGenerationRequest(parsedRequest.data);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid calendar generation payload',
          detail: error instanceof z.ZodError ? error.flatten() : String(error),
        },
        { status: 400 },
      );
    }
  }

  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/x-ndjson',
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    'x-supabase-auth': token,
    'x-auth-token': token,
    'X-Brand-Profile-Id': payload.brandProfileId,
  };

  const upstreamResponse = await fetch(backendUrl, {
    method: 'POST',
    headers: fetchHeaders,
    body: JSON.stringify(payload),
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    let detail: unknown = null;
    try {
      detail = await upstreamResponse.json();
    } catch {
      try {
        detail = await upstreamResponse.text();
      } catch {
        detail = null;
      }
    }
    return NextResponse.json(
      { error: 'Failed to start calendar generation', detail },
      { status: upstreamResponse.status || 502 },
    );
  }

  const reader = upstreamResponse.body.getReader();
  let abortHandler: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (abortHandler) {
          request.signal.removeEventListener('abort', abortHandler);
          abortHandler = null;
        }
      };

      abortHandler = () => {
        cleanup();
        void reader.cancel();
        controller.close();
      };

      const forward = (): void => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              cleanup();
              controller.close();
              return;
            }
            if (value) {
              controller.enqueue(value);
            }
            forward();
          })
          .catch((err) => {
            cleanup();
            controller.error(err);
          });
      };

      request.signal.addEventListener('abort', abortHandler);
      forward();
    },
    cancel() {
      if (abortHandler) {
        request.signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
      void reader.cancel();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
