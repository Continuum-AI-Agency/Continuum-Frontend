export type ServerSentEventHandler = (eventName: string | null, data: string) => void;

export async function readServerSentEvents({
  reader,
  onEvent,
  signal,
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  onEvent: ServerSentEventHandler;
  signal?: AbortSignal;
}): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingEvent: string | null = null;
  let pendingData: string[] = [];

  const flushPendingEvent = () => {
    if (!pendingEvent) {
      pendingData = [];
      return;
    }
    onEvent(pendingEvent, pendingData.join("\n"));
    pendingEvent = null;
    pendingData = [];
  };

  try {
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel(signal.reason);
        } catch {
          // best-effort
        }
        flushPendingEvent();
        return;
      }

      const { value, done } = await reader.read();
      if (done) {
        flushPendingEvent();
        return;
      }
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          flushPendingEvent();
          pendingEvent = line.slice(6).trim() || null;
          continue;
        }

        if (line.startsWith("data:")) {
          if (!pendingEvent) pendingEvent = "message";
          pendingData.push(line.slice(5));
          continue;
        }

        if (line.trim() === "") {
          flushPendingEvent();
          continue;
        }

        if (line.startsWith(":")) {
          continue;
        }

        if (!pendingEvent) pendingEvent = "message";
        pendingData.push(line);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // best-effort
    }
  }
}

