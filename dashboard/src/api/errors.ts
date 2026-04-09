export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function parseApiError(response: Response): Promise<ApiError> {
  const status = response.status;
  const text = await response.text();

  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;

    if (typeof obj.message === "string") {
      return new ApiError(obj.message, status, typeof obj.code === "string" ? obj.code : undefined, obj);
    }

    if (obj.detail && typeof obj.detail === "object") {
      const detail = obj.detail as Record<string, unknown>;
      const message = typeof detail.message === "string" ? detail.message : response.statusText || `Request failed (${status})`;
      const code = typeof detail.code === "string" ? detail.code : undefined;
      return new ApiError(message, status, code, obj);
    }
  }

  return new ApiError(text || response.statusText || `Request failed (${status})`, status, undefined, payload);
}

export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
