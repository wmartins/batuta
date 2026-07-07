import { randomUUID } from "node:crypto";
import type { Scope, Storage } from "batuta";
import createClient from "openapi-fetch";

import type { components, paths } from "./generated/api.js";

export type BatutaClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retries?: number;
};

export type QueryUsageInput = {
  metric: string;
  scopes: Scope<string>[];
};

export type RecordUsageEvent = {
  metric: string;
  scope: Scope<string>;
  consumed: number;
};

export type BatutaProblem = components["schemas"]["Problem"];

export class BatutaApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: BatutaProblem | undefined,
    readonly requestId: string | undefined,
  ) {
    super(problem?.title ?? `Batuta API request failed with status ${status}.`);
    this.name = "BatutaApiError";
  }
}

export class BatutaTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Batuta API request timed out after ${timeoutMs}ms.`);
    this.name = "BatutaTimeoutError";
  }
}

const API_KEY =
  /^batuta_live_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY = /^[!-~]{8,128}$/;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

function normalizedBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be an absolute URL.");
  }
  if (url.username || url.password) {
    throw new TypeError("baseUrl must not contain credentials.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new TypeError("baseUrl must use HTTPS except on loopback hosts.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return delay >= 0 && delay <= 2000 ? delay : undefined;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProblem(value: unknown): value is BatutaProblem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      "title" in value &&
      "status" in value &&
      "instance" in value,
  );
}

export class BatutaClient {
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #retries: number;
  readonly #client: ReturnType<typeof createClient<paths>>;

  constructor(options: BatutaClientOptions) {
    const baseUrl = normalizedBaseUrl(options.baseUrl);
    if (!API_KEY.test(options.apiKey)) {
      throw new TypeError("apiKey must use the Batuta live-key format.");
    }
    const timeoutMs = options.timeoutMs ?? 10_000;
    const retries = options.retries ?? 2;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("timeoutMs must be a positive integer.");
    }
    if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
      throw new TypeError("retries must be an integer from 0 through 10.");
    }
    this.#apiKey = options.apiKey;
    this.#timeoutMs = timeoutMs;
    this.#retries = retries;
    const transport = options.fetch ?? globalThis.fetch;
    this.#client = createClient<paths>({
      baseUrl,
      fetch: async (input: Request) => {
        const original = input;
        const body = original.body
          ? await original.clone().arrayBuffer()
          : undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
          try {
            const response = await transport(
              new Request(original, {
                ...(body ? { body } : {}),
                signal: controller.signal,
              }),
            );
            if (
              !RETRY_STATUSES.has(response.status) ||
              attempt === this.#retries
            ) {
              return response;
            }
            await response.body?.cancel();
            const cap = Math.min(2000, 100 * 2 ** attempt);
            await wait(retryAfterMs(response) ?? Math.random() * cap);
          } catch (error) {
            if (controller.signal.aborted) {
              lastError = new BatutaTimeoutError(this.#timeoutMs);
            } else {
              lastError = error;
            }
            if (attempt === this.#retries) throw lastError;
            const cap = Math.min(2000, 100 * 2 ** attempt);
            await wait(Math.random() * cap);
          } finally {
            clearTimeout(timeout);
          }
        }
        throw lastError;
      },
    });
  }

  async queryUsage(input: QueryUsageInput): Promise<{
    evaluatedAt: string;
    results: Storage.Usage.Result<string, string>[];
  }> {
    if (input.scopes.length < 1 || input.scopes.length > 100) {
      throw new TypeError("scopes must contain between 1 and 100 items.");
    }
    const { data, error, response } = await this.#client.POST(
      "/api/v1/usage/query",
      {
        headers: { Authorization: `Bearer ${this.#apiKey}` },
        body: input,
      },
    );
    if (!data) {
      throw new BatutaApiError(
        response.status,
        isProblem(error) ? error : undefined,
        response.headers.get("X-Request-Id") ?? undefined,
      );
    }
    return data;
  }

  async recordUsage(
    events: readonly RecordUsageEvent[],
    options?: { idempotencyKey?: string },
  ): Promise<{
    batchId: string;
    recorded: number;
    occurredAt: string;
    replayed: boolean;
  }> {
    if (events.length < 1 || events.length > 100) {
      throw new TypeError("events must contain between 1 and 100 items.");
    }
    const idempotencyKey = options?.idempotencyKey ?? randomUUID();
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new TypeError(
        "idempotencyKey must be 8 to 128 visible ASCII characters.",
      );
    }
    const { data, error, response } = await this.#client.POST(
      "/api/v1/usage/events",
      {
        params: { header: { "Idempotency-Key": idempotencyKey } },
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
        },
        body: { events: [...events] },
      },
    );
    if (!data) {
      throw new BatutaApiError(
        response.status,
        isProblem(error) ? error : undefined,
        response.headers.get("X-Request-Id") ?? undefined,
      );
    }
    return {
      ...data,
      replayed: response.headers.get("Idempotency-Replayed") === "true",
    };
  }
}
