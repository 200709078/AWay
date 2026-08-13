const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor() {
    super("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    this.name = "NetworkError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  const url = buildApiUrl(path);

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    throw new NetworkError();
  }

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new ApiError(response.status, readApiMessage(payload));
  }

  return payload as T;
}

function buildApiUrl(path: string) {
  if (!configuredApiUrl) {
    throw new ApiConfigurationError(
      "API adresi yapılandırılmamış. EXPO_PUBLIC_API_URL değerini ayarlayın.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(configuredApiUrl);
  } catch {
    throw new ApiConfigurationError(
      "EXPO_PUBLIC_API_URL geçerli bir API adresi olmalıdır.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new ApiConfigurationError(
      "EXPO_PUBLIC_API_URL yalnız HTTP veya HTTPS adresi olabilir.",
    );
  }

  if (parsedUrl.protocol === "http:" && process.env.NODE_ENV === "production") {
    throw new ApiConfigurationError(
      "Üretimde EXPO_PUBLIC_API_URL için HTTPS kullanın.",
    );
  }

  const baseUrl = parsedUrl.toString().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl}${normalizedPath}`;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readApiMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = payload.message;

    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === "string").join(" ");
    }

    if (typeof message === "string") {
      return message;
    }
  }

  return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}
