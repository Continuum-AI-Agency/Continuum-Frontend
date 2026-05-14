# AI Studio — HyperFrames endpoint (frontend integration)

This guide is everything a frontend engineer needs to integrate the new HyperFrames endpoint end-to-end: render selectors, call the API, drive the SSE stream into UI state, fetch the produced HTML, and encode it to video client-side via **mediabunny**. The backend never writes media to disk — the artifact is an `index.html` stored in a dedicated Supabase bucket and the frontend does all rendering/encoding.

---

## 1. Architecture at a glance

```
┌─────────────────┐   POST /api/ai-studio/generate-hyperframes    ┌────────────────────────┐
│  Frontend       │ ──────────────────────────────────────────▶  │  Fastify (AI Studio)   │
│  (React/Next)   │                                               │  HyperframesService    │
│                 │ ◀── SSE: status → init → spec → stored → done │  → generateObject      │
└────────┬────────┘                                               │  → renderer            │
         │                                                        │  → Supabase upload     │
         │ GET signed_url (Supabase)                              └────────────┬───────────┘
         │ ◀── self-contained index.html                                       │
         │                                                                     ▼
         ▼                                                          ┌────────────────────┐
┌─────────────────┐                                                  │ hyperframes-       │
│  <iframe>       │                                                  │ compositions       │
│  + mediabunny   │ ─── encodes WebM/MP4 ────▶ download / share      │ (Supabase bucket)  │
└─────────────────┘                                                  └────────────────────┘
```

- The frontend only ever sees an HTML URL plus a structured `spec`.
- All copy, scenes, palette, typography, and timing decisions are made by the agent.
- The user controls 4 enums (+ optional attachments + trends) — nothing else.

---

## 2. Endpoints

### 2.1 `GET /api/ai-studio/hyperframes/options`

Returns the enum metadata to populate selectors. Call this once on mount; the response is small and rarely changes.

**Response:**

```ts
{
  aspect_ratios: ("16:9" | "9:16" | "1:1")[];
  style_presets: (
    | "cinematic" | "kinetic-type" | "minimal" | "brutalist"
    | "editorial" | "neon" | "retro" | "futuristic"
  )[];
  tones: ("calm" | "balanced" | "high-energy")[];
  duration_range: { min: 5; max: 30; default: 15 };
  attachment_mime_prefixes: ("image/" | "video/" | "audio/")[];
}
```

### 2.2 `POST /api/ai-studio/generate-hyperframes`

Streams Server-Sent Events. Content-Type is `text/event-stream`.

**Request body:**

```ts
type HyperframesRequest = {
  prompt: string;                     // required, free-form creative brief
  brand_id: string;                   // required
  user_id?: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1";          // default "16:9"
  duration_seconds?: number;          // 5..30, default 15
  style_preset?: HyperframesStylePreset;            // default "cinematic"
  tone?: "calm" | "balanced" | "high-energy";       // default "balanced"

  // Optional: user pre-attaches creatives (any URL the backend should embed).
  // Up to 20. URLs are pass-through — they MUST be CORS-accessible from the
  // frontend's origin (signed Supabase URLs work; cross-origin CDN URLs need
  // `crossorigin` headers set on the resource).
  attachments?: Array<{
    url: string;
    mime_type: string;                // must start with image/, video/, or audio/
    label?: string;                   // semantic tag: "logo", "product", "hero", "b-roll"
    scene_role_hint?: string;         // optional pin: "intro", "feature", "outro"
  }>;

  // Optional: trend tags grounded into copy
  trends?: Array<{
    trend_id: string;
    title: string;
    summary?: string;
    keywords?: string[];
  }>;

  filename?: string;                  // reserved, not currently used
};
```

**Response: SSE event sequence**

| Event       | When emitted                  | Payload shape                                                                                                                       |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `status`    | At each phase transition      | `{ phase: "starting" \| "generating-spec" \| "rendering" \| "uploading", bucket?: string }`                                          |
| `init`      | Right after `status:starting` | `{ composition_id, aspect_ratio, duration_seconds, style_preset, tone, model }`                                                     |
| `spec`      | Agent produced the spec       | `{ spec: CompositionSpec }` — preview the structure pre-render                                                                       |
| `stored`    | HTML uploaded                 | `{ bucket: "hyperframes-compositions", path: string, signed_url: string }`                                                          |
| `complete`  | Terminal success              | `{ composition_id, brand_id, aspect_ratio, duration_seconds, style_preset, tone, storage: {…}, spec: CompositionSpec }`             |
| `error`     | Terminal failure              | `{ message: string, code?: "spec_validation_failed" \| "generation_failed" }`                                                       |
| `ping`      | Every 15s while open          | `{ ts: number }` — ignore in UI                                                                                                     |

End of stream is signalled by either `complete` or `error`. The connection closes after either fires.

---

## 3. TypeScript types (copy into the frontend)

These mirror `app/ai-studio/types.ts` and `app/ai-studio/hyperframes/spec-schema.ts`. If you can import from the monorepo, do that; otherwise duplicate.

```ts
export type HyperframesAspectRatio = "16:9" | "9:16" | "1:1";
export type HyperframesStylePreset =
  | "cinematic" | "kinetic-type" | "minimal" | "brutalist"
  | "editorial" | "neon" | "retro" | "futuristic";
export type HyperframesTone = "calm" | "balanced" | "high-energy";

export type HyperframesAttachment = {
  url: string;
  mime_type: string;
  label?: string;
  scene_role_hint?: string;
};

export type HyperframesTrend = {
  trend_id: string;
  title: string;
  summary?: string;
  keywords?: string[];
};

export type HyperframesLayout =
  | "centered-title" | "split-text-media" | "stat-hero"
  | "media-fullbleed" | "quote" | "outro";

export type SceneSpec = {
  id: string;
  role: string;
  start_seconds: number;
  duration_seconds: number;
  layout: HyperframesLayout;
  copy: {
    title?: string;
    subtitle?: string;
    body?: string;
    stat_value?: string;
    stat_label?: string;
  };
  attachment_ref?: string;
  transition_in?: "cut" | "crossfade" | "wipe" | "slide" | "scale";
  motion: { entrance_ease: string; body_ease: string; exit_ease: string };
};

export type CompositionSpec = {
  title: string;
  width: number;
  height: number;
  duration_seconds: number;
  palette: { background: string; foreground: string; accent: string; muted: string };
  typography: { headline_family: string; body_family: string; headline_weight: number };
  scenes: SceneSpec[];
  background_audio_ref?: string;
};

export type HyperframesCompleteEvent = {
  composition_id: string;
  brand_id: string;
  aspect_ratio: HyperframesAspectRatio;
  duration_seconds: number;
  style_preset: HyperframesStylePreset;
  tone: HyperframesTone;
  storage: { bucket: string; path: string; signed_url: string };
  spec: CompositionSpec;
};
```

---

## 4. Consuming the SSE stream

`fetch + ReadableStream` is the recommended path (the browser's built-in `EventSource` doesn't support POST bodies and has no abort semantics).

```ts
type Handlers = {
  onInit?: (e: { composition_id: string; model: string }) => void;
  onStatus?: (phase: string) => void;
  onSpec?: (spec: CompositionSpec) => void;
  onStored?: (s: { signed_url: string }) => void;
  onComplete: (result: HyperframesCompleteEvent) => void;
  onError: (message: string, code?: string) => void;
};

export async function generateHyperframes(
  body: HyperframesRequest,
  handlers: Handlers,
  signal?: AbortSignal,
) {
  const res = await fetch("/api/ai-studio/generate-hyperframes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    credentials: "include",
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    handlers.onError(`HTTP ${res.status}: ${text || "no body"}`);
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = parseSseFrame(raw);
      if (!event) continue;
      routeEvent(event, handlers);
    }
  }
}

function parseSseFrame(raw: string): { event: string; data: any } | null {
  let event = "message";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

function routeEvent(e: { event: string; data: any }, h: Handlers) {
  switch (e.event) {
    case "ping": return;
    case "status": return h.onStatus?.(e.data.phase);
    case "init": return h.onInit?.(e.data);
    case "spec": return h.onSpec?.(e.data.spec);
    case "stored": return h.onStored?.(e.data);
    case "complete": return h.onComplete(e.data);
    case "error": return h.onError(e.data.message, e.data.code);
  }
}
```

---

## 5. React example (selector → SSE → preview → encode)

```tsx
import { useEffect, useRef, useState } from "react";
import * as Mediabunny from "mediabunny";

type Phase = "idle" | "generating-spec" | "rendering" | "uploading" | "ready" | "encoding" | "done" | "error";

export function HyperframesStudio({ brandId }: { brandId: string }) {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof fetchOptions>> | null>(null);
  const [form, setForm] = useState({
    prompt: "",
    aspect_ratio: "16:9" as HyperframesAspectRatio,
    duration_seconds: 15,
    style_preset: "cinematic" as HyperframesStylePreset,
    tone: "balanced" as HyperframesTone,
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [spec, setSpec] = useState<CompositionSpec | null>(null);
  const [result, setResult] = useState<HyperframesCompleteEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchOptions().then(setOptions);
  }, []);

  const submit = async () => {
    setPhase("generating-spec");
    setErrorMsg(null);
    setSpec(null);
    setResult(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    await generateHyperframes(
      { ...form, brand_id: brandId },
      {
        onStatus: (p) => setPhase(p as Phase),
        onSpec: setSpec,
        onComplete: (r) => {
          setResult(r);
          setPhase("ready");
        },
        onError: (msg) => {
          setErrorMsg(msg);
          setPhase("error");
        },
      },
      abortRef.current.signal,
    );
  };

  return (
    <div>
      {/* selectors driven by `options` */}
      <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
      {/* … aspect_ratio / duration / style / tone pickers … */}

      <button disabled={phase !== "idle" && phase !== "ready" && phase !== "done" && phase !== "error"} onClick={submit}>
        Generate
      </button>

      <PhaseIndicator phase={phase} />
      {spec && <SpecOutline spec={spec} />}
      {result && <HyperframesPreview result={result} onEncoded={() => setPhase("done")} />}
      {errorMsg && <div role="alert">{errorMsg}</div>}
    </div>
  );
}

async function fetchOptions() {
  const res = await fetch("/api/ai-studio/hyperframes/options", { credentials: "include" });
  if (!res.ok) throw new Error("options fetch failed");
  return res.json() as Promise<{
    aspect_ratios: HyperframesAspectRatio[];
    style_presets: HyperframesStylePreset[];
    tones: HyperframesTone[];
    duration_range: { min: number; max: number; default: number };
    attachment_mime_prefixes: string[];
  }>;
}
```

### Phase → UX mapping

| Phase             | Suggested UI                                  |
| ----------------- | --------------------------------------------- |
| `starting`        | spinner + "Warming up the director…"          |
| `generating-spec` | spinner + "Writing the storyboard…"           |
| `spec` received   | reveal scene outline (titles + durations)     |
| `rendering`       | progress + "Assembling the composition…"      |
| `uploading`       | progress + "Saving…"                          |
| `ready`           | mount preview iframe, show "Render to video"  |
| `encoding`        | mediabunny progress callback                  |
| `done`            | download button + share                       |

---

## 6. Preview & encode with mediabunny

The artifact is a complete standalone HTML document that:

- Loads GSAP from `cdn.jsdelivr.net`.
- Loads fonts from `fonts.googleapis.com`.
- Registers a single timeline at `window.__timelines["root"]` (paused).
- Sets the canvas size via the wrapping `<div data-composition-id="root" data-width data-height data-duration>`.

To preview live, load it in an iframe and seek the GSAP timeline against your own clock. To produce a video, drive seeks deterministically frame-by-frame and let mediabunny encode each frame.

```tsx
import { useEffect, useRef } from "react";
import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
  BufferTarget,
} from "mediabunny";

type Props = {
  result: HyperframesCompleteEvent;
  fps?: number;
  format?: "mp4" | "webm";
  onEncoded?: (blob: Blob) => void;
};

export function HyperframesPreview({ result, fps = 30, format = "mp4", onEncoded }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleEncode = async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const win = iframe.contentWindow as any;
    const tl = win.__timelines?.root;
    if (!tl) throw new Error("hyperframes timeline not loaded yet");

    const { width, height, duration_seconds } = result.spec;
    const totalFrames = Math.round(duration_seconds * fps);

    // 1. Capture target canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;

    // 2. Build mediabunny output
    const output = new Output({
      format: format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const videoSource = new CanvasSource(canvas, { codec: format === "mp4" ? "avc" : "vp9", bitrate: 8_000_000 });
    output.addVideoTrack(videoSource, { frameRate: fps });
    await output.start();

    // 3. Frame-by-frame: seek → rasterize iframe DOM → encode
    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      tl.seek(t);
      // Allow the browser to flush style/layout changes
      await new Promise(requestAnimationFrame);

      // Snapshot the iframe DOM into the canvas. Use html2canvas for now —
      // in mediabunny v6+ you may prefer the iframe-source helper.
      const bitmap = await rasterizeIframe(iframe, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      await videoSource.add(t, 1 / fps);
    }

    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    const blob = new Blob([buffer], { type: format === "mp4" ? "video/mp4" : "video/webm" });
    onEncoded?.(blob);
  };

  return (
    <div>
      <iframe
        ref={iframeRef}
        src={result.storage.signed_url}
        sandbox="allow-scripts allow-same-origin"
        width={result.spec.width / 2}
        height={result.spec.height / 2}
        style={{ border: "1px solid #ddd" }}
      />
      <button onClick={handleEncode}>Render to {format.toUpperCase()}</button>
    </div>
  );
}

// rasterizeIframe is a thin helper. Two common implementations:
//   (a) html2canvas against iframe.contentDocument.documentElement
//   (b) iframe.contentWindow's <canvas> rendering pipeline (if the comp uses one)
// Pick whichever path your team already has — the contract here is: produce a
// frame-aligned ImageBitmap matching `width` x `height`.
async function rasterizeIframe(iframe: HTMLIFrameElement, w: number, h: number): Promise<ImageBitmap> {
  // implementation depends on your chosen capture library
  // returning a placeholder OffscreenCanvas to satisfy the type
  return createImageBitmap(new ImageData(w, h));
}
```

> **Note on mediabunny API specifics**: confirm method names against the version in your `package.json` — the public API around `Output` / `CanvasSource` / `BufferTarget` has stabilized but check the changelog when upgrading. The flow above (paused GSAP timeline + deterministic seek + per-frame encode) is what makes the composition reproducible — every render of the same composition_id produces an identical video.

---

## 7. Attachments — how URLs flow

The backend embeds attachment URLs verbatim into the HTML; the browser then loads them when the iframe renders. Practical rules:

1. **Use absolute URLs**, not relative paths.
2. **CORS:** the resource server must allow the frontend's origin (Supabase Storage signed URLs are fine). The renderer applies `crossorigin="anonymous"` to all `<img>`/`<video>`/`<audio>` elements.
3. **MIME types must start with `image/`, `video/`, or `audio/`.** The Zod schema rejects anything else with a 400.
4. **Pre-upload UX:** if your UI lets users drop assets, upload them to a Supabase bucket *first*, get a signed URL, then attach that URL to the request. Don't include base64 — the backend isn't doing intake here.
5. **Labels guide the agent:** `label: "logo"` makes the agent place that asset in intro/outro; `label: "b-roll"` distributes it across feature scenes.
6. **`scene_role_hint`** pins an attachment to a scene role (`"intro"`, `"feature"`, `"outro"`). Use sparingly — agent will respect it.

---

## 8. Trends — how to attach them

If the user has selected trends on a `TrendCard` node in the frontend, map each to the trend payload:

```ts
trends: selectedTrends.map((t) => ({
  trend_id: t.id,
  title: t.title,
  summary: t.summary ?? undefined,
  keywords: t.keywords?.slice(0, 20),
}))
```

The agent weaves trends into copy without naming them literally. Keep `summary` under ~2000 chars; max 10 trends per request.

---

## 9. Errors and edge cases

| Failure mode                              | Where surfaced              | UI handling                                                                |
| ----------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Validation 400 (bad prompt/aspect/etc.)  | HTTP response, not SSE      | Show inline form errors using `error.details` (Zod issues)                 |
| Stream interrupted mid-flight             | fetch rejects / abort       | Allow user to retry. The backend doesn't resume — start fresh.             |
| `error` event with `spec_validation_failed` | SSE `error` event           | Surface as "Agent produced an invalid plan — try a more specific prompt." |
| `error` event with `generation_failed`    | SSE `error` event           | Surface as "Generation failed. Try again."                                 |
| Signed URL expired (after 1h)             | iframe shows 403           | Re-request the composition or store the path and create a fresh URL.       |

The composition_id is durable. If you stored the composition by id, you can mint a new signed URL from the backend in the future via a separate "re-sign" endpoint (not implemented yet — propose if needed).

---

## 10. Local dev

1. Backend on `localhost:4000` via `make dev`.
2. Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000` (or your frontend's equivalent) and proxy CORS through `app/cors.ts` (already wired for the frontend origin).
3. Supabase: the bucket `hyperframes-compositions` exists in the same project as the rest of the app. No additional config needed; the backend uses the service role.
4. Quick curl smoke test:

   ```bash
   curl -N -X POST http://localhost:4000/api/ai-studio/generate-hyperframes \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "15s product launch for a new running shoe, kinetic energy",
       "brand_id": "demo",
       "duration_seconds": 15,
       "style_preset": "kinetic-type",
       "tone": "high-energy",
       "aspect_ratio": "9:16"
     }'
   ```

   You should see `status:starting → init → status:generating-spec → spec → status:rendering → status:uploading → stored → complete`. The `complete` payload contains the signed URL — open it in a browser to confirm the composition renders.

---

## 11. What to build first (recommended order)

1. **`fetchOptions()` + selector form** — wire enums, validate locally before hitting the API.
2. **`generateHyperframes()` SSE consumer** — render phase indicator (no preview yet).
3. **`<SpecOutline>`** — render the scene list as the agent produces it (great UX: users see structure within ~5s).
4. **Iframe preview** — load `signed_url`, allow play/pause/seek using `window.__timelines["root"]`.
5. **Trend node + attachment dropper** — let users attach trend cards and creative URLs to the request.
6. **mediabunny encode pipeline** — paused-timeline seek + per-frame capture + MP4/WebM output.
7. **Persistence / library view** (later) — currently each generation is stateless; if you need a "my compositions" surface, the backend will need a table.

---

## 12. Reference

- Backend route: `app/ai-studio/routes.ts`
- Controller handlers: `app/ai-studio/controller.ts` (`handleHyperframesGeneration`, `handleHyperframesOptions`)
- Service: `app/ai-studio/services/hyperframes-service.ts`
- Spec schema: `app/ai-studio/hyperframes/spec-schema.ts`
- Renderer: `app/ai-studio/hyperframes/renderer.ts`
- Style presets: `app/ai-studio/hyperframes/styles.ts`
- Storage bucket migration: `supabase/migrations/20260513_hyperframes_compositions_bucket.sql`
- HyperFrames composition rules (source of truth for what the renderer emits): `~/.claude/skills/hyperframes/`
