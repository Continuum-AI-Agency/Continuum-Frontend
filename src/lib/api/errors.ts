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
  const message = payload?.message || `${response.status} ${response.statusText}`;
  const code = payload?.code;
  return new ApiError(message, response.status, code, payload);
}

export async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw await toApiError(response);
  }
}


