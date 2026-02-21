import { HttpClient } from "../http";
import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  UserProfile,
  UserUsageResponse,
} from "../types";

/**
 * Authentication and user account management.
 *
 * Endpoints that require a JWT (me, listApiKeys, createApiKey, deleteApiKey,
 * getUsage) will automatically use the token that was stored by the last
 * successful call to `login()` or `register()`. You can also set the token
 * manually via `client.setAuthToken()`.
 */
export class AuthResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Register a new user account.
   *
   * The JWT returned in the response is automatically stored and used for
   * subsequent JWT-protected requests.
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const result = await this.http.post<AuthResponse>("/auth/register", data);
    this.http.setJwtToken(result.token);
    return result;
  }

  /**
   * Log in with email and password.
   *
   * The JWT returned in the response is automatically stored and used for
   * subsequent JWT-protected requests.
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const result = await this.http.post<AuthResponse>("/auth/login", data);
    this.http.setJwtToken(result.token);
    return result;
  }

  /**
   * Return the profile of the currently authenticated user.
   * Requires a valid JWT (set automatically after login/register).
   */
  me(): Promise<UserProfile> {
    return this.http.jwtGet<UserProfile>("/auth/me");
  }

  /**
   * List all API keys belonging to the authenticated user.
   * Requires a valid JWT.
   */
  listApiKeys(): Promise<ApiKey[]> {
    return this.http.jwtGet<ApiKey[]>("/auth/api-keys");
  }

  /**
   * Create a new API key for the authenticated user.
   * The plaintext key is returned only in this response; store it securely.
   * Requires a valid JWT.
   */
  createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return this.http.jwtPost<CreateApiKeyResponse>("/auth/api-keys", data);
  }

  /**
   * Delete an API key by its ID.
   * Requires a valid JWT.
   */
  deleteApiKey(keyId: string): Promise<void> {
    return this.http.jwtDelete<void>(`/auth/api-keys/${encodeURIComponent(keyId)}`);
  }

  /**
   * Get the current usage and configured thresholds for the authenticated user.
   * Requires a valid JWT.
   */
  getUsage(): Promise<UserUsageResponse> {
    return this.http.jwtGet<UserUsageResponse>("/auth/usage");
  }
}
