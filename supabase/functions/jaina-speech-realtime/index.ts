import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ClientSocketMessage =
  | {
      type: "session.configure";
      data?: {
        languageCode?: string;
        model?: string;
      };
    }
  | {
      type: "audio.chunk";
      data?: {
        sequence?: number;
        audioBase64?: string;
        mimeType?: string;
      };
    }
  | {
      type: "session.stop";
    }
  | {
      type: "ping";
    };

type GoogleRecognizeResult = {
  alternatives?: Array<{
    transcript?: string;
    confidence?: number;
  }>;
  languageCode?: string;
};

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    headers: jsonHeaders,
    ...init,
  });
}

function parseClientMessage(raw: string): ClientSocketMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const message = parsed as { type?: unknown; data?: unknown };
    if (typeof message.type !== "string") return null;
    if (message.type === "session.configure") {
      return {
        type: "session.configure",
        data:
          message.data && typeof message.data === "object"
            ? (message.data as ClientSocketMessage["data"])
            : undefined,
      };
    }
    if (message.type === "audio.chunk") {
      return {
        type: "audio.chunk",
        data:
          message.data && typeof message.data === "object"
            ? (message.data as ClientSocketMessage["data"])
            : undefined,
      };
    }
    if (message.type === "session.stop" || message.type === "ping") {
      return { type: message.type };
    }
    return null;
  } catch {
    return null;
  }
}

function safeSocketSend(
  socket: WebSocket,
  payload: Record<string, unknown>
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function decodePemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwt(
  privateKeyPem: string,
  claims: Record<string, unknown>
): Promise<string> {
  const encodedHeader = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedClaims = toBase64Url(JSON.stringify(claims));
  const unsigned = `${encodedHeader}.${encodedClaims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodePemToArrayBuffer(privateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const signatureBytes = new Uint8Array(signatureBuffer);
  let binary = "";
  for (const byte of signatureBytes) {
    binary += String.fromCharCode(byte);
  }
  const signature = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${unsigned}.${signature}`;
}

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")?.trim();
  const serviceAccountPrivateKey = Deno.env
    .get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
    ?.replace(/\\n/g, "\n")
    .trim();

  if (!serviceAccountEmail || !serviceAccountPrivateKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(serviceAccountPrivateKey, {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/cloud-platform",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text().catch(() => "token_error");
    throw new Error(`Failed to get Google access token: ${detail}`);
  }

  const tokenJson = await tokenResponse.json();
  const accessToken =
    tokenJson && typeof tokenJson === "object" && "access_token" in tokenJson
      ? (tokenJson.access_token as string | undefined)
      : undefined;
  if (!accessToken) {
    throw new Error("Google OAuth token response missing access_token.");
  }
  return accessToken;
}

function mergeTranscript(previous: string, incoming: string): string {
  const prev = previous.trim();
  const next = incoming.trim();
  if (!next) return prev;
  if (!prev) return next;
  if (next.startsWith(prev)) return next;
  if (prev.endsWith(next)) return prev;

  const prevWords = prev.split(/\s+/);
  const nextWords = next.split(/\s+/);
  const maxOverlap = Math.min(prevWords.length, nextWords.length, 12);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const prevTail = prevWords.slice(-overlap).join(" ");
    const nextHead = nextWords.slice(0, overlap).join(" ");
    if (prevTail === nextHead) {
      return `${prev} ${nextWords.slice(overlap).join(" ")}`.trim();
    }
  }

  return `${prev} ${next}`.trim();
}

function computeTranscriptDelta(previous: string, next: string): string {
  if (!next.trim()) return "";
  if (!previous.trim()) return next;
  if (next.startsWith(previous)) {
    return next.slice(previous.length).trim();
  }
  return next;
}

async function transcribeChunkWithGoogle(input: {
  audioBase64: string;
  languageCode: string;
  model: string;
  mimeType?: string;
}): Promise<{
  transcript: string;
  confidence: number | null;
  languageCode: string | null;
}> {
  const projectId = Deno.env.get("GOOGLE_STT_PROJECT_ID")?.trim();
  const location = "us";
  const recognizer = "_";
  if (!projectId) {
    throw new Error("Missing GOOGLE_STT_PROJECT_ID");
  }

  const speechApiHost = `${location}-speech.googleapis.com`;
  const recognizeUrlBase =
    `https://${speechApiHost}/v2/projects/${encodeURIComponent(projectId)}` +
    `/locations/${encodeURIComponent(location)}` +
    `/recognizers/${encodeURIComponent(recognizer)}:recognize`;

  const normalizedMimeType = (input.mimeType || "").toLowerCase();
  const explicitDecodingConfig = normalizedMimeType.includes("audio/webm")
    ? {
        encoding: "WEBM_OPUS",
        sampleRateHertz: 48000,
        audioChannelCount: 1,
      }
    : normalizedMimeType.includes("audio/ogg")
      ? {
          encoding: "OGG_OPUS",
          sampleRateHertz: 48000,
          audioChannelCount: 1,
        }
      : normalizedMimeType.includes("audio/mp4")
        ? {
            encoding: "MP4_AAC",
            sampleRateHertz: 48000,
            audioChannelCount: 1,
          }
        : null;

  const requestBody = JSON.stringify({
    config: {
      ...(explicitDecodingConfig
        ? { explicitDecodingConfig }
        : { autoDecodingConfig: {} }),
      languageCodes: [input.languageCode],
      model: input.model,
      features: {
        enableAutomaticPunctuation: true,
      },
    },
    content: input.audioBase64,
  });
  const accessToken = await getGoogleAccessToken();
  const recognizeResponse = await fetch(recognizeUrlBase, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: requestBody,
  });

  if (!recognizeResponse.ok) {
    const detail = await recognizeResponse.text().catch(() => "recognize_error");
    throw new Error(`Google STT recognize failed: ${detail}`);
  }

  const responseJson = await recognizeResponse.json();
  const results =
    responseJson && typeof responseJson === "object" && "results" in responseJson
      ? (responseJson.results as GoogleRecognizeResult[] | undefined)
      : undefined;

  if (!Array.isArray(results) || results.length === 0) {
    return { transcript: "", confidence: null, languageCode: null };
  }

  const parts: string[] = [];
  let confidenceSum = 0;
  let confidenceCount = 0;
  let detectedLanguage: string | null = null;

  for (const result of results) {
    if (!detectedLanguage && typeof result.languageCode === "string") {
      detectedLanguage = result.languageCode;
    }
    const firstAlternative = Array.isArray(result.alternatives)
      ? result.alternatives[0]
      : undefined;
    if (!firstAlternative?.transcript?.trim()) continue;
    parts.push(firstAlternative.transcript.trim());
    if (typeof firstAlternative.confidence === "number") {
      confidenceSum += firstAlternative.confidence;
      confidenceCount += 1;
    }
  }

  return {
    transcript: parts.join(" ").trim(),
    confidence:
      confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(4)) : null,
    languageCode: detectedLanguage,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  const isWebSocketUpgrade =
    req.headers.get("upgrade")?.toLowerCase() === "websocket";
  if (!isWebSocketUpgrade) {
    return jsonResponse(
      { error: "Expected websocket upgrade request." },
      { status: 426 }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token")?.trim() || "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const accessToken = queryToken || bearerToken;
  if (!accessToken) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: claimsData, error: authError } = await supabase.auth.getClaims(accessToken);
  if (authError || !claimsData?.claims?.sub) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const sessionId = crypto.randomUUID();
  let languageCode = "en-US";
  let model = "chirp_3";
  let transcript = "";
  let isStopping = false;
  let processingQueue = Promise.resolve();

  socket.onopen = () => {
    safeSocketSend(socket, {
      type: "ready",
      data: {
        sessionId,
      },
    });
  };

  socket.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    const message = parseClientMessage(event.data);
    if (!message) {
      safeSocketSend(socket, {
        type: "error",
        data: { message: "Invalid socket message payload." },
      });
      return;
    }

    if (message.type === "ping") {
      safeSocketSend(socket, { type: "pong" });
      return;
    }

    if (message.type === "session.configure") {
      const nextLanguage =
        message.data && typeof message.data.languageCode === "string"
          ? message.data.languageCode.trim()
          : "";
      const nextModel =
        message.data && typeof message.data.model === "string"
          ? message.data.model.trim()
          : "";
      if (nextLanguage) languageCode = nextLanguage;
      if (nextModel) model = nextModel;
      return;
    }

    if (message.type === "session.stop") {
      if (isStopping) return;
      isStopping = true;
      void processingQueue
        .catch(() => {})
        .then(() => {
          safeSocketSend(socket, {
            type: "transcript.done",
            data: { transcript },
          });
          socket.close(1000, "session_complete");
        });
      return;
    }

    if (message.type !== "audio.chunk") {
      return;
    }

    const audioBase64 =
      message.data && typeof message.data.audioBase64 === "string"
        ? message.data.audioBase64.trim()
        : "";
    const sequence =
      message.data && typeof message.data.sequence === "number"
        ? message.data.sequence
        : undefined;
    const mimeType =
      message.data && typeof message.data.mimeType === "string"
        ? message.data.mimeType.trim()
        : "";
    if (!audioBase64) return;

    processingQueue = processingQueue
      .then(async () => {
        const chunkResult = await transcribeChunkWithGoogle({
          audioBase64,
          languageCode,
          model,
          mimeType,
        });
        if (!chunkResult.transcript.trim()) return;

        const previousTranscript = transcript;
        transcript = mergeTranscript(previousTranscript, chunkResult.transcript);
        const delta = computeTranscriptDelta(previousTranscript, transcript);
        if (!delta) return;

        safeSocketSend(socket, {
          type: "transcript.delta",
          data: {
            delta,
            transcript,
            sequence,
            confidence: chunkResult.confidence,
            languageCode: chunkResult.languageCode ?? languageCode,
            model,
          },
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Transcription error.";
        safeSocketSend(socket, {
          type: "error",
          data: { message },
        });
      });
  };

  socket.onclose = () => {
    isStopping = true;
  };

  socket.onerror = () => {
    isStopping = true;
  };

  return response;
});
