import { z } from "zod";

const querySchema = z.object({
  src: z.string().min(1).max(2048),
});

function isAllowedAvatarHost(hostname: string): boolean {
  return /^lh\d+\.googleusercontent\.com$/i.test(hostname);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const parsed = querySchema.safeParse({
    src: requestUrl.searchParams.get("src"),
  });

  if (!parsed.success) {
    return Response.json({ error: "Invalid avatar src" }, { status: 400 });
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(parsed.data.src);
  } catch {
    return Response.json({ error: "Invalid avatar src" }, { status: 400 });
  }

  if (remoteUrl.protocol !== "https:") {
    return Response.json({ error: "Unsupported avatar protocol" }, { status: 400 });
  }

  if (!isAllowedAvatarHost(remoteUrl.hostname)) {
    return Response.json({ error: "Unsupported avatar host" }, { status: 400 });
  }

  const upstream = await fetch(remoteUrl.toString(), {
    next: { revalidate: 60 * 60 },
    headers: {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!upstream.ok) {
    return Response.json({ error: "Avatar fetch failed" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return Response.json({ error: "Upstream did not return an image" }, { status: 502 });
  }

  if (!upstream.body) {
    return Response.json({ error: "Upstream returned empty image" }, { status: 502 });
  }

  const reader = upstream.body.getReader();
  let firstChunk: Uint8Array | null = null;
  try {
    const firstRead = await reader.read();
    if (firstRead.done || !firstRead.value || firstRead.value.byteLength === 0) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return Response.json({ error: "Upstream returned empty image" }, { status: 502 });
    }
    firstChunk = firstRead.value;
  } catch {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    return Response.json({ error: "Avatar fetch failed" }, { status: 502 });
  }

  let abortHandler: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (abortHandler) {
          request.signal.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }
      };

      abortHandler = () => {
        cleanup();
        void reader.cancel();
        controller.close();
      };

      request.signal.addEventListener("abort", abortHandler);

      controller.enqueue(firstChunk as Uint8Array);

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

      forward();
    },
    cancel() {
      if (abortHandler) {
        request.signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
      void reader.cancel();
    },
  });

  const contentLength = upstream.headers.get("content-length");
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
  });
}
