export type CallbackContext = {
  context: string;
  provider: string | null;
};

export function resolveCallbackContext(input: {
  queryContext: string | null;
  queryProvider: string | null;
  cookieContext: string | undefined;
  cookieProvider: string | undefined;
  defaultContext?: string;
}): CallbackContext {
  const context = input.queryContext ?? input.cookieContext ?? input.defaultContext ?? "login";
  const provider = input.queryProvider ?? input.cookieProvider ?? null;
  return { context, provider };
}

