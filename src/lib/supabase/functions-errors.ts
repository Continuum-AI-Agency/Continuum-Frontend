type ResponseLike = {
  text: () => Promise<string>;
};

type FunctionsInvokeError = {
  message?: string;
  context?: {
    body?: string;
  } | ResponseLike;
};

function isResponseLike(value: unknown): value is ResponseLike {
  return typeof value === "object" && value !== null && "text" in value && typeof (value as ResponseLike).text === "function";
}

function parseErrorBody(body: string | null): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? null;
  } catch {
    return body;
  }
}

export async function getFunctionsInvokeErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as FunctionsInvokeError;
  const message = candidate.message ?? null;
  const context = candidate.context;

  if (context && typeof context === "object") {
    if ("body" in context && typeof context.body === "string") {
      return parseErrorBody(context.body) ?? message;
    }
    if (isResponseLike(context)) {
      const text = await context.text().catch(() => null);
      return parseErrorBody(text) ?? message;
    }
  }

  return message;
}
