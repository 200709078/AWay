const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "")
  .trim()
  .replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await responseErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };

    if (Array.isArray(body.message)) {
      return body.message.join(" ");
    }

    if (typeof body.message === "string") {
      return body.message;
    }
  } catch {
    // API yanıtı JSON değilse güvenli varsayılan hata metnini kullan.
  }

  return "İstek tamamlanamadı. Lütfen tekrar deneyin.";
}
