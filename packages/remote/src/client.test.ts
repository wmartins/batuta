import { afterEach, describe, expect, test, vi } from "vitest";

import { BatutaApiError, BatutaClient, BatutaTimeoutError } from "./client.js";
import { BatutaStorage } from "./storage.js";

const apiKey = `batuta_live_00000000-0000-4000-8000-000000000001_${"a".repeat(43)}`;

afterEach(() => vi.restoreAllMocks());

describe("BatutaClient", () => {
  test("validates server-only connection options synchronously", () => {
    expect(
      () => new BatutaClient({ baseUrl: "http://example.com", apiKey }),
    ).toThrow(/HTTPS/);
    expect(
      () =>
        new BatutaClient({ baseUrl: "https://user:pass@example.com", apiKey }),
    ).toThrow(/credentials/);
    expect(
      () =>
        new BatutaClient({ baseUrl: "https://example.com", apiKey: "secret" }),
    ).toThrow(/live-key format/);
  });

  test("queries the versioned path without transmitting the generic client timestamp", async () => {
    const fetch: typeof globalThis.fetch = vi.fn(async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe("http://localhost:3000/api/v1/usage/query");
      expect(request.headers.get("Authorization")).toBe(`Bearer ${apiKey}`);
      expect(await request.json()).toEqual({
        metric: "credits",
        scopes: [{ key: "user", value: "user-1" }],
      });
      return Response.json({
        evaluatedAt: "2026-07-07T12:00:00.000Z",
        results: [],
      });
    });
    const client = new BatutaClient({
      baseUrl: "http://localhost:3000/",
      apiKey,
      fetch,
      retries: 0,
    });
    await expect(
      client.queryUsage({
        metric: "credits",
        scopes: [{ key: "user", value: "user-1" }],
      }),
    ).resolves.toEqual({
      evaluatedAt: "2026-07-07T12:00:00.000Z",
      results: [],
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("retries writes with identical bytes and one stable idempotency key", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const bodies: string[] = [];
    const keys: string[] = [];
    const fetch: typeof globalThis.fetch = vi.fn(async (input, init) => {
      const request = new Request(input, init);
      bodies.push(await request.text());
      keys.push(request.headers.get("Idempotency-Key") ?? "");
      if (bodies.length === 1) return new Response(null, { status: 503 });
      return Response.json(
        {
          batchId: "00000000-0000-4000-8000-000000000002",
          recorded: 1,
          occurredAt: "2026-07-07T12:00:00.000Z",
        },
        { status: 201 },
      );
    });
    const client = new BatutaClient({
      baseUrl: "http://127.0.0.1:3000",
      apiKey,
      fetch,
      retries: 1,
    });
    await expect(
      client.recordUsage([
        {
          metric: "credits",
          scope: { key: "user", value: "user-1" },
          consumed: 1,
        },
      ]),
    ).resolves.toMatchObject({ recorded: 1, replayed: false });
    expect(bodies[0]).toBe(bodies[1]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^[!-~]{8,128}$/);
  });

  test("retains problem details and request IDs on API errors", async () => {
    const problem = {
      type: "urn:batuta:problem:invalid-request",
      title: "Invalid request",
      status: 422,
      instance: "urn:batuta:request:req-1",
    };
    const client = new BatutaClient({
      baseUrl: "https://example.com",
      apiKey,
      retries: 0,
      fetch: async () =>
        Response.json(problem, {
          status: 422,
          headers: {
            "Content-Type": "application/problem+json",
            "X-Request-Id": "req-1",
          },
        }),
    });
    const error = await client
      .queryUsage({ metric: "credits", scopes: [{ key: "user", value: "1" }] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BatutaApiError);
    expect(error).toMatchObject({ status: 422, problem, requestId: "req-1" });
  });

  test("distinguishes per-attempt timeouts", async () => {
    const client = new BatutaClient({
      baseUrl: "https://example.com",
      apiKey,
      timeoutMs: 1,
      retries: 0,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      },
    });
    await expect(
      client.queryUsage({
        metric: "credits",
        scopes: [{ key: "user", value: "1" }],
      }),
    ).rejects.toBeInstanceOf(BatutaTimeoutError);
  });
});

describe("BatutaStorage", () => {
  test("turns empty storage operations into local no-ops", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const storage = new BatutaStorage<string, string>({
      baseUrl: "http://[::1]:3000",
      apiKey,
      fetch,
    });
    await expect(
      storage.usage({ metric: "credits", scopes: [], at: new Date() }),
    ).resolves.toEqual([]);
    await expect(storage.record([])).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
