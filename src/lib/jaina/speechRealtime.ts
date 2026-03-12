import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";

type SpeechRealtimeEvent =
  | {
      type: "ready";
      data?: {
        sessionId?: string;
      };
    }
  | {
      type: "transcript.delta";
      data?: {
        delta?: string;
        transcript?: string;
        sequence?: number;
      };
    }
  | {
      type: "transcript.done";
      data?: {
        transcript?: string;
      };
    }
  | {
      type: "error";
      data?: {
        message?: string;
      };
    };

type OpenSpeechRealtimeSessionInput = {
  languageCode?: string;
  model?: string;
  onDelta?: (delta: string, transcript?: string) => void;
  onDone?: (transcript: string) => void;
  onError?: (message: string) => void;
};

export type SpeechRealtimeSession = {
  sendAudioChunk: (audioChunk: Blob) => Promise<void>;
  stop: () => void;
  close: () => void;
};

function getSpeechRealtimeWebSocketUrl(token: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  const wsBase = supabaseUrl.replace(/^http/, "ws");
  const endpoint = `${wsBase}/functions/v1/jaina-speech-realtime`;
  const query = new URLSearchParams({ token });
  return `${endpoint}?${query.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRealtimeEvent(event: MessageEvent<string>): SpeechRealtimeEvent | null {
  if (typeof event.data !== "string") return null;
  try {
    const parsed = JSON.parse(event.data) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
    const data = isRecord(parsed.data) ? parsed.data : undefined;
    if (parsed.type === "ready") {
      return {
        type: "ready",
        data: {
          sessionId: typeof data?.sessionId === "string" ? data.sessionId : undefined,
        },
      };
    }
    if (parsed.type === "transcript.delta") {
      return {
        type: "transcript.delta",
        data: {
          delta: typeof data?.delta === "string" ? data.delta : undefined,
          transcript:
            typeof data?.transcript === "string" ? data.transcript : undefined,
          sequence: typeof data?.sequence === "number" ? data.sequence : undefined,
        },
      };
    }
    if (parsed.type === "transcript.done") {
      return {
        type: "transcript.done",
        data: {
          transcript:
            typeof data?.transcript === "string" ? data.transcript : undefined,
        },
      };
    }
    if (parsed.type === "error") {
      return {
        type: "error",
        data: {
          message: typeof data?.message === "string" ? data.message : undefined,
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function openSpeechRealtimeSession(
  input: OpenSpeechRealtimeSessionInput
): Promise<SpeechRealtimeSession> {
  if (typeof window === "undefined") {
    throw new Error("WebSocket session can only be opened in the browser.");
  }

  const token = await getBrowserAccessToken();
  if (!token) {
    throw new Error("Missing browser access token.");
  }

  const ws = new WebSocket(getSpeechRealtimeWebSocketUrl(token));
  const configuredLanguageCode = input.languageCode || "en-US";
  const configuredModel = input.model || "chirp_3";

  await new Promise<void>((resolve, reject) => {
    const handleOpen = () => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = () => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("error", handleError);
      reject(new Error("Failed to open speech realtime socket."));
    };
    ws.addEventListener("open", handleOpen);
    ws.addEventListener("error", handleError);
  });

  ws.send(
    JSON.stringify({
      type: "session.configure",
      data: {
        languageCode: configuredLanguageCode,
        model: configuredModel,
      },
    })
  );

  ws.addEventListener("message", (event) => {
    const parsedEvent = parseRealtimeEvent(event as MessageEvent<string>);
    if (!parsedEvent) return;

    if (parsedEvent.type === "transcript.delta") {
      const delta =
        parsedEvent.data && typeof parsedEvent.data.delta === "string"
          ? parsedEvent.data.delta
          : "";
      const transcript =
        parsedEvent.data && typeof parsedEvent.data.transcript === "string"
          ? parsedEvent.data.transcript
          : undefined;
      if (!delta && !transcript) return;
      input.onDelta?.(delta, transcript);
      return;
    }

    if (parsedEvent.type === "transcript.done") {
      const transcript =
        parsedEvent.data && typeof parsedEvent.data.transcript === "string"
          ? parsedEvent.data.transcript
          : "";
      input.onDone?.(transcript);
      return;
    }

    if (parsedEvent.type === "error") {
      const message =
        parsedEvent.data && typeof parsedEvent.data.message === "string"
          ? parsedEvent.data.message
          : "Speech realtime error.";
      input.onError?.(message);
    }
  });

  let sequence = 0;
  let sendQueue = Promise.resolve();

  return {
    sendAudioChunk: async (audioChunk: Blob) => {
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error("Speech realtime socket is not open.");
      }
      sendQueue = sendQueue.then(async () => {
        sequence += 1;
        const audioBase64 = await blobToBase64(audioChunk);
        ws.send(
          JSON.stringify({
            type: "audio.chunk",
            data: {
              sequence,
              audioBase64,
              mimeType: audioChunk.type || undefined,
            },
          })
        );
      });
      await sendQueue;
    },
    stop: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "session.stop" }));
      }
    },
    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}
