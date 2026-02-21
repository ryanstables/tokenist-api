import { TokenistClient } from "../src/client";
import { TokenistError } from "../src/error";
import { mockFetch } from "./helpers";

const BASE_URL = "https://tokenist.example.com";
const API_KEY = "ug_test_api_key";

describe("TokenistClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("throws when apiKey is missing", () => {
      expect(
        () => new TokenistClient({ apiKey: "", baseUrl: BASE_URL })
      ).toThrow("apiKey is required");
    });

    it("throws when baseUrl is missing", () => {
      expect(
        () => new TokenistClient({ apiKey: API_KEY, baseUrl: "" })
      ).toThrow("baseUrl is required");
    });

    it("exposes admin and sdk sub-resources", () => {
      const client = new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
      expect(client.admin).toBeDefined();
      expect(client.sdk).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("throws TokenistError on non-2xx responses", async () => {
      const client = new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
      mockFetch({ status: 404, body: { error: "Not found" } });

      await expect(client.admin.listUsers()).rejects.toBeInstanceOf(TokenistError);
    });

    it("includes the HTTP status in TokenistError", async () => {
      const client = new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
      mockFetch({ status: 403, body: { error: "Forbidden" } });

      let err: TokenistError | undefined;
      try {
        await client.admin.listUsers();
      } catch (e) {
        err = e as TokenistError;
      }
      expect(err?.status).toBe(403);
      expect(err?.message).toBe("Forbidden");
    });

    it("uses a fallback message when the body has no error field", async () => {
      const client = new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
      mockFetch({ status: 500, body: { unexpected: true } });

      let err: TokenistError | undefined;
      try {
        await client.admin.listUsers();
      } catch (e) {
        err = e as TokenistError;
      }
      expect(err?.message).toMatch(/500/);
    });
  });

  describe("request authentication", () => {
    it("sends the API key as Bearer token on every request", async () => {
      const client = new TokenistClient({ apiKey: API_KEY, baseUrl: BASE_URL });
      const spy = mockFetch({ body: [] });

      await client.admin.listUsers();

      const [, options] = spy.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`Bearer ${API_KEY}`);
    });
  });

  describe("baseUrl normalisation", () => {
    it("strips trailing slashes from baseUrl", async () => {
      const client = new TokenistClient({
        apiKey: API_KEY,
        baseUrl: `${BASE_URL}/`,
      });
      const spy = mockFetch({ body: [] });
      await client.admin.listUsers();

      const [url] = spy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/admin/users`);
    });
  });
});
