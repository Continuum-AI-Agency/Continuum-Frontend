export type ChunkOptions = {
  chunkSize?: number; // approx chars
  overlap?: number; // approx chars
};

export function chunkText(text: string, options?: ChunkOptions): string[] {
  const size = Math.max(256, options?.chunkSize ?? 2000);
  const overlap = Math.max(0, Math.min(size - 1, options?.overlap ?? 200));
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + size);
    chunks.push(text.slice(i, end));
    if (end >= text.length) break;
    i = end - overlap;
  }
  return chunks;
}


