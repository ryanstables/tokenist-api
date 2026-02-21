import { TokenistError } from "./error";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** When true, use the stored JWT; when false (default), use the API key. */
  useJwt?: boolean;
}

/**
 * Minimal HTTP client that wraps the native `fetch` API.
 * Used internally by resource classes.
 *
 * Authentication strategy:
 * - Regular requests (`useJwt` omitted or false): always send `Bearer <apiKey>`.
 * - JWT requests (`useJwt: true`): send `Bearer <jwtToken>`, throwing if unset.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  /** Optional JWT stored after a successful login/register. */
  private jwtToken?: string;

  constructor(baseUrl: string, apiKey: string) {
    // Strip trailing slash so path concatenation is predictable.
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  /** Store a JWT for use in subsequent auth-protected requests. */
  setJwtToken(token: string | undefined): void {
    this.jwtToken = token;
  }

  getJwtToken(): string | undefined {
    return this.jwtToken;
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

    let authHeader: string;
    if (opts.useJwt) {
      if (!this.jwtToken) {
        throw new Error(
          "No JWT token set. Call auth.login() or auth.register() first, or set the token manually via client.setAuthToken()."
        );
      }
      authHeader = `Bearer ${this.jwtToken}`;
    } else {
      authHeader = `Bearer ${this.apiKey}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader,
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

  /** Convenience helpers – all use API key auth. */

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

  /** Convenience helpers – all use JWT auth. Throw if no JWT is set. */

  jwtGet<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>({ path, query, useJwt: true });
  }

  jwtPost<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body, useJwt: true });
  }

  jwtDelete<T>(path: string): Promise<T> {
    return this.request<T>({ method: "DELETE", path, useJwt: true });
  }
}
