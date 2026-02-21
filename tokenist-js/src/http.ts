import { TokenistError } from "./error";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Minimal HTTP client that wraps the native `fetch` API.
 * Used internally by resource classes.
 *
 * Every request is authenticated with `Authorization: Bearer <apiKey>`.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Strip trailing slash so path concatenation is predictable.
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const url = new URL(`${this.baseUrl}${opts.path}`);

    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    const response = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    let responseBody: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    if (!response.ok) {
      throw new TokenistError(response.status, responseBody);
    }

    return responseBody as T;
  }

  get<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>({ path, query });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", path, body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>({ method: "DELETE", path });
  }
}
