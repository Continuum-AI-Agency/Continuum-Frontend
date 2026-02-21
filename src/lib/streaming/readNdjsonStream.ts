type ReadNdjsonStreamOptions = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  onLine: (line: string) => void;
};

function splitConcatenatedJsonPayloads(rawLine: string): string[] | null {
  const line = rawLine.trim();
  if (!line || (line[0] !== "{" && line[0] !== "[")) {
    return null;
  }

  const payloads: string[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    while (cursor < line.length && /\s/.test(line[cursor])) {
      cursor += 1;
    }
    if (cursor >= line.length) break;

    const start = line[cursor];
    if (start !== "{" && start !== "[") {
      return null;
    }

    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let endIndex = -1;

    for (let index = cursor; index < line.length; index += 1) {
      const char = line[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }
      if (char === "}" || char === "]") {
        const opener = stack.pop();
        const matchesPair =
          (opener === "{" && char === "}") || (opener === "[" && char === "]");
        if (!matchesPair) {
          return null;
        }
        if (stack.length === 0) {
          endIndex = index;
          break;
        }
      }
    }

    if (endIndex < 0) {
      return null;
    }

    payloads.push(line.slice(cursor, endIndex + 1));
    cursor = endIndex + 1;
  }

  return payloads.length > 1 ? payloads : null;
}

export async function readNdjsonStream({ reader, onLine }: ReadNdjsonStreamOptions): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  const emitLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;

    const splitPayloads = splitConcatenatedJsonPayloads(line);
    if (splitPayloads) {
      splitPayloads.forEach((payload) => onLine(payload));
      return;
    }

    onLine(line);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      emitLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  emitLine(buffer);
}
