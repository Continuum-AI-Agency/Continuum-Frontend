type ReadNdjsonStreamOptions = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  onLine: (line: string) => void;
};

export async function readNdjsonStream({ reader, onLine }: ReadNdjsonStreamOptions): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  const tail = buffer.trim();
  if (tail) onLine(tail);
}
