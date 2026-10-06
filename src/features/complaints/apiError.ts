export class ComplaintApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ComplaintApiError';
    this.status = status;
    this.code = code;
  }
}

export async function readComplaintResponse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;

  const payload = await response.json().catch(() => null) as {
    code?: unknown;
    message?: unknown;
    error?: unknown;
  } | null;
  const code = typeof payload?.code === 'string' ? payload.code : 'UNKNOWN';
  const message = typeof payload?.message === 'string'
    ? payload.message
    : typeof payload?.error === 'string'
      ? payload.error
      : `No pudimos procesar la solicitud (${response.status}).`;
  throw new ComplaintApiError(response.status, code, message);
}
