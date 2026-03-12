import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SpeechTranscriptionRequest = {
  audioBase64: string;
  mimeType?: string;
  languageCode?: string;
  stream?: boolean;
  model?: string;
};

type GoogleRecognizeResult = {
  alternatives?: Array<{
    transcript?: string;
    confidence?: number;
  }>;
  languageCode?: string;
};

function toSseFrame(event: string, payload: unknown): string {
  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const lines = serialized.split("\n").map((line) => `data: ${line}`).join("\n");
  return `event: ${event}\n${lines}\n\n`;
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeAudioBase64(value: string): string {
  return value.replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
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

async function signJwt(
  privateKeyPem: string,
  claims: Record<string, unknown>
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedClaims = toBase64Url(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

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
    new TextEncoder().encode(unsignedToken)
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
  return `${unsignedToken}.${signature}`;
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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    throw new Error("Google OAuth token response did not include access_token");
  }

  return accessToken;
}

function extractTranscript(results: GoogleRecognizeResult[] | undefined): {
  transcript: string;
  confidence: number | null;
  languageCode: string | null;
} {
  if (!Array.isArray(results) || results.length === 0) {
    return { transcript: "", confidence: null, languageCode: null };
  }

  let confidenceSum = 0;
  let confidenceCount = 0;
  let detectedLanguage: string | null = null;
  const parts: string[] = [];

  for (const result of results) {
    if (!detectedLanguage && typeof result.languageCode === "string") {
      detectedLanguage = result.languageCode;
    }
    const firstAlternative = Array.isArray(result.alternatives)
      ? result.alternatives[0]
      : undefined;
    if (!firstAlternative || typeof firstAlternative.transcript !== "string") {
      continue;
    }
    const transcriptPart = firstAlternative.transcript.trim();
    if (!transcriptPart) continue;
    parts.push(transcriptPart);
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

function chunkTranscript(transcript: string, wordsPerChunk = 5): string[] {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += wordsPerChunk) {
    chunks.push(words.slice(index, index + wordsPerChunk).join(" "));
  }
  return chunks;
}

async function transcribeWithGoogle(
  payload: Required<
    Pick<SpeechTranscriptionRequest, "audioBase64" | "languageCode" | "model">
  > & { mimeType?: string }
): Promise<{
  transcript: string;
  confidence: number | null;
  languageCode: string | null;
  raw: unknown;
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
  const normalizedMimeType = (payload.mimeType || "").toLowerCase();
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
      languageCodes: [payload.languageCode],
      model: payload.model,
      features: {
        enableAutomaticPunctuation: true,
      },
    },
    content: payload.audioBase64,
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
  const extracted = extractTranscript(results);

  return {
    transcript: extracted.transcript,
    confidence: extracted.confidence,
    languageCode: extracted.languageCode,
    raw: responseJson,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: SpeechTranscriptionRequest;
  try {
    payload = (await req.json()) as SpeechTranscriptionRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const audioBase64 = normalizeAudioBase64(payload.audioBase64 ?? "");
  if (!audioBase64) {
    return new Response(JSON.stringify({ error: "audioBase64 is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const languageCode = payload.languageCode?.trim() || "en-US";
  const model = payload.model?.trim() || "chirp_3";
  const shouldStream = payload.stream !== false;

  try {
    const result = await transcribeWithGoogle({
      audioBase64,
      languageCode,
      model,
      mimeType: payload.mimeType,
    });

    if (!shouldStream) {
      return new Response(
        JSON.stringify({
          transcript: result.transcript,
          confidence: result.confidence,
          languageCode: result.languageCode ?? languageCode,
          model,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const chunks = chunkTranscript(result.transcript);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let transcriptSoFar = "";

        controller.enqueue(
          encoder.encode(
            toSseFrame("ready", {
              model,
              languageCode: result.languageCode ?? languageCode,
              chunkCount: chunks.length,
            })
          )
        );

        for (const chunk of chunks) {
          transcriptSoFar = transcriptSoFar
            ? `${transcriptSoFar} ${chunk}`.trim()
            : chunk;
          controller.enqueue(
            encoder.encode(
              toSseFrame("transcript.delta", {
                delta: chunk,
                transcript: transcriptSoFar,
              })
            )
          );
        }

        controller.enqueue(
          encoder.encode(
            toSseFrame("transcript.done", {
              transcript: result.transcript,
              confidence: result.confidence,
              languageCode: result.languageCode ?? languageCode,
              model,
            })
          )
        );
        controller.enqueue(encoder.encode(toSseFrame("done", "1")));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[jaina-speech-to-text]", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Speech transcription failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
