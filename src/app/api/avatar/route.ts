import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  src: z.string().url().max(2048),
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
    return NextResponse.json({ error: "Invalid avatar src" }, { status: 400 });
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(parsed.data.src);
  } catch {
    return NextResponse.json({ error: "Invalid avatar src" }, { status: 400 });
  }

  if (remoteUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported avatar protocol" }, { status: 400 });
  }

  if (!isAllowedAvatarHost(remoteUrl.hostname)) {
    return NextResponse.json({ error: "Unsupported avatar host" }, { status: 400 });
  }

  const upstream = await fetch(remoteUrl.toString(), {
    next: { revalidate: 60 * 60 },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Avatar fetch failed" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/*",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

