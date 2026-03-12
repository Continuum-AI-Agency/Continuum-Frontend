type SpeechStreamDeltaHandler = (delta: string) => void;

type StreamJainaSpeechToTextInput = {
  audioBlob: Blob;
  languageCode?: string;
  model?: string;
  onDelta?: SpeechStreamDeltaHandler;
  signal?: AbortSignal;
};

type ParsedSseEvent = {
  event: string;
  data: string;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function parseSseEventBlock(block: string): ParsedSseEvent | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  let event = "message";
  const dataLines: string[] = [];
  for (const line of trimmed.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  return {
    event,
    data: dataLines.join("\n"),
  };
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function streamJainaSpeechToText(
  input: StreamJainaSpeechToTextInput
): Promise<string> {
  const audioBase64 = await blobToBase64(input.audioBlob);

  const response = await fetch("/api/agents/jaina/speech/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      audioBase64,
      mimeType: input.audioBlob.type || "audio/webm",
      languageCode: input.languageCode || "en-US",
      model: input.model,
      stream: true,
    }),
    signal: input.signal,
    cache: "no-store",
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "Transcription failed");
    throw new Error(detail || "Transcription failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let transcript = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex < 0) break;

      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const parsedEvent = parseSseEventBlock(rawEvent);
      if (!parsedEvent) continue;

      if (parsedEvent.event === "transcript.delta") {
        const parsed = parseJsonObject(parsedEvent.data);
        const delta = parsed && typeof parsed.delta === "string" ? parsed.delta : "";
        if (!delta) continue;
        transcript = transcript ? `${transcript} ${delta}`.trim() : delta;
        input.onDelta?.(delta);
      }

      if (parsedEvent.event === "transcript.done") {
        const parsed = parseJsonObject(parsedEvent.data);
        if (parsed && typeof parsed.transcript === "string") {
          transcript = parsed.transcript.trim();
        }
      }
    }
  }

  if (!transcript) {
    throw new Error("No transcript returned");
  }

  return transcript;
}
