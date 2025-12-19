import type { BackendGeminiContent, ChatConversationTurn } from "@/lib/types/chatImage";

function normalizeTurnContent(content: string): string {
  return content.trim();
}

export function toBackendGeminiHistory(turns: readonly ChatConversationTurn[]): BackendGeminiContent[] {
  return turns
    .map((turn) => {
      const text = normalizeTurnContent(turn.content);
      if (!text) return null;
      return {
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text }],
      } satisfies BackendGeminiContent;
    })
    .filter((turn): turn is BackendGeminiContent => turn !== null);
}

