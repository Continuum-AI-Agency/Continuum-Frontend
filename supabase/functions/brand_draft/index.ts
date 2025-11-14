// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: brand_draft
// Streams two parallel channels (brandVoice, targetAudience) via SSE

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type DraftRequest = {
  brandId: string;
  websiteUrl: string;
  locale?: string;
};

function sseEncode(event: string, data: string): string {
  return `event: ${event}\n` + data.split("\n").map(line => `data: ${line}`).join("\n") + "\n\n";
}

function toReadableStream(write: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await write(controller);
      } catch (error) {
        controller.enqueue(encoder.encode(sseEncode("error", (error as Error).message)));
      } finally {
        controller.close();
      }
    },
  });
}

async function streamResponsesApi({
  input,
  system,
  channel,
  signal,
}: {
  input: string;
  system: string;
  channel: "brandVoice" | "targetAudience";
  signal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("RESPONSES_MODEL")?.trim() || "gpt-5.1";
  const baseUrl = Deno.env.get("OPENAI_BASE_URL")?.trim() || "https://api.openai.com";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const body = {
    model,
    stream: true,
    reasoning: { effort: "low" as const },
    text: { verbosity: "low" as const },
    tools: [{ type: "web_search" as const }],
    instructions: system,
    input,
  };

  const res = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let details = `${res.status}`;
    try {
      const errorText = await res.text();
      if (errorText) details += ` ${errorText}`;
    } catch (error) {
      console.error("[brand_draft] Failed reading Responses API error body", error);
    }
    throw new Error(`Responses API error: ${details}`.trim());
  }

  if (!res.body) {
    throw new Error("Responses API error: missing body");
  }

  console.log("[brand_draft] Responses stream established", { channel, model });

  const encoder = new TextEncoder();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const { value, done } = await reader.read();
      if (done) {
        ctrl.enqueue(encoder.encode(sseEncode(`${channel}Done`, "1")));
        ctrl.close();
        return;
      }
      if (!value) return;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        ctrl.enqueue(encoder.encode(sseEncode("debug", JSON.stringify({ channel, raw: payload }))));
        if (payload === "[DONE]") {
          ctrl.enqueue(encoder.encode(sseEncode(`${channel}Done`, "1")));
          ctrl.close();
          return;
        }
        let delta = "";
        try {
          const obj = JSON.parse(payload);
          if (obj?.type === "response.output_text.delta" && typeof obj.delta === "string") {
            delta = obj.delta;
          } else if (obj?.type === "response.message.delta" && obj.delta?.type === "output_text" && typeof obj.delta.text === "string") {
            delta = obj.delta.text;
          } else {
            continue;
          }
        } catch {
          continue;
        }
        if (delta) {
          console.log(`[brand_draft] ${channel} delta`, delta.slice(0, 80));
          const payload = JSON.stringify({ delta });
          ctrl.enqueue(encoder.encode(sseEncode(channel, payload)));
          ctrl.enqueue(encoder.encode(sseEncode("delta", JSON.stringify({ channel, delta }))));
        }
      }
    },
    cancel() {
      try { reader.cancel(); } catch {}
    },
  });
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: DraftRequest | null = null;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!payload?.brandId || !payload?.websiteUrl) {
    return new Response(JSON.stringify({ error: "Missing brandId or websiteUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { brandId, websiteUrl, locale } = payload;
  const lc = (locale || "en-US").slice(0, 5);

  const voiceSystem = `You are drafting a concise brand voice summary using the website as primary source. Output brief, actionable tone guidance; 2-3 sentences plus 5-8 adjectives. Locale: ${lc}.`;
  const audienceSystem = `You are drafting a concise target audience summary using the website as primary source. Output 2-3 sentences plus bullet segments (3-5). Locale: ${lc}.`;
  const voiceInput = `Website: ${websiteUrl}\nInstruction: Derive brand voice.`;
  const audienceInput = `Website: ${websiteUrl}\nInstruction: Derive target audience.`;

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort("timeout"), 25_000);

  const voicePromise = streamResponsesApi({ input: voiceInput, system: voiceSystem, channel: "brandVoice", signal: abort.signal });
  const audiencePromise = streamResponsesApi({ input: audienceInput, system: audienceSystem, channel: "targetAudience", signal: abort.signal });
  const [voiceStream, audienceStream] = await Promise.all([voicePromise, audiencePromise]);

  const merged = toReadableStream(async (controller) => {
    // Initial ready event
    controller.enqueue(encoder.encode(sseEncode("ready", "1")));

    const readers = [voiceStream.getReader(), audienceStream.getReader()];
    const doneFlags = [false, false];

    try {
      while (true) {
        const results = await Promise.race(
          readers
            .map((r, idx) => r.read().then(res => ({ idx, res })))
            .filter((_, i) => !doneFlags[i])
        );

        if (!results) break;
        const { idx, res } = results as { idx: number; res: ReadableStreamReadResult<Uint8Array> };
        if (res.done) {
          doneFlags[idx] = true;
          if (doneFlags.every(Boolean)) break;
          continue;
        }
        if (res.value) controller.enqueue(res.value);
      }
    } catch (e) {
      controller.enqueue(encoder.encode(sseEncode("error", (e as Error).message)));
    } finally {
      clearTimeout(timeout);
      controller.enqueue(encoder.encode(sseEncode("done", "1")));
    }
  });

  return new Response(merged, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});


