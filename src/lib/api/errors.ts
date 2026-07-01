export type ApiErrorPayload = {
  message?: string;
  code?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, code?: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | undefined;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    // ignore non-JSON errors
  }
  let message = payload?.message;
  if (!message && typeof payload?.error === "string") {
    message = payload.error;
  }
  if (!message && payload?.error && typeof payload.error === "object") {
    const err = payload.error as Record<string, unknown>;
    const fieldErrors = err.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors) {
      const fields = Object.entries(fieldErrors)
        .map(([f, msgs]) => `${f}: ${(msgs as string[]).join(", ")}`)
        .join("; ");
      if (fields) message = `Validation error — ${fields}`;
    }
    if (!message && Array.isArray(err.formErrors) && (err.formErrors as string[]).length > 0) {
      message = (err.formErrors as string[]).join("; ");
    }
  }
  message = message || `${response.status} ${response.statusText}`;
  const code = (payload?.code ?? payload?.errorCode) as string | undefined;
  return new ApiError(message, response.status, code, payload);
}

export async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export type InstagramLookupErrorKind = "account_required" | "lookup_unavailable" | "not_found" | "generic";

// Maps an error from the Instagram business_discovery endpoints (AI Studio import,
// competitor search) to a UI message kind. 409 = the brand has no connected IG
// business account (account required); 503 = a viewer resolved but Graph refused
// it — expired token / missing permission / throttle (reconnect); 404 = the target
// handle is not a public business/creator account.
export function instagramLookupErrorKind(error: unknown): InstagramLookupErrorKind {
  if (error instanceof ApiError) {
    if (error.code === "IG_VIEWER_UNAVAILABLE" || error.status === 409) return "account_required";
    if (error.code === "IG_LOOKUP_UNAVAILABLE" || error.status === 503) return "lookup_unavailable";
    if (error.code === "IG_ACCOUNT_NOT_FOUND" || error.status === 404) return "not_found";
  }
  return "generic";
}


