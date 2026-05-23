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


