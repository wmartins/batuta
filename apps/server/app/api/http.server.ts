import { randomUUID } from "node:crypto";
import type { ZodError } from "zod";

export const MAX_BODY_BYTES = 256 * 1024;
const VISIBLE_ASCII = /^[!-~]+$/;

export class UnsupportedMediaTypeError extends Error {}
export class PayloadTooLargeError extends Error {}
export class MalformedJsonError extends Error {}
export class InvalidIdempotencyKeyError extends Error {}
export class RuntimeRateLimitError extends Error {
  constructor(readonly retryAfter?: string) {
    super("The runtime API rate limit was exceeded.");
  }
}

export function requestIdFor(request: Request) {
  const supplied = request.headers.get("X-Request-Id");
  return supplied && supplied.length <= 128 && VISIBLE_ASCII.test(supplied)
    ? supplied
    : randomUUID();
}

export function requireJsonContentType(request: Request) {
  const mediaType = request.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") throw new UnsupportedMediaTypeError();
}

export function requireIdempotencyKey(request: Request) {
  const value = request.headers.get("Idempotency-Key");
  if (
    !value ||
    value.length < 8 ||
    value.length > 128 ||
    !VISIBLE_ASCII.test(value)
  ) {
    throw new InvalidIdempotencyKeyError();
  }
  return value;
}

export async function readBoundedBody(request: Request) {
  const length = request.headers.get("Content-Length");
  if (length && Number(length) > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(result.value);
  }
  return Buffer.concat(chunks, total);
}

export function parseJson(bytes: Buffer) {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new MalformedJsonError();
  }
}

function baseHeaders(requestId: string) {
  return {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  };
}

export function jsonResponse(
  value: unknown,
  options: { requestId: string; status: number; headers?: HeadersInit },
) {
  return Response.json(value, {
    status: options.status,
    headers: {
      ...baseHeaders(options.requestId),
      ...Object.fromEntries(new Headers(options.headers)),
    },
  });
}

export function problemResponse(options: {
  requestId: string;
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: readonly { path: string; code: string; message: string }[];
  headers?: HeadersInit;
}) {
  return new Response(
    JSON.stringify({
      type: options.type,
      title: options.title,
      status: options.status,
      instance: `urn:batuta:request:${options.requestId}`,
      ...(options.detail ? { detail: options.detail } : {}),
      ...(options.errors ? { errors: options.errors } : {}),
    }),
    {
      status: options.status,
      headers: {
        ...baseHeaders(options.requestId),
        "Content-Type": "application/problem+json",
        ...Object.fromEntries(new Headers(options.headers)),
      },
    },
  );
}

export function zodErrors(error: ZodError) {
  return error.issues.map((issue) => ({
    path: `/${issue.path
      .map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1"))
      .join("/")}`,
    code: issue.code,
    message: issue.message,
  }));
}

export function methodNotAllowed(requestId: string) {
  return problemResponse({
    requestId,
    type: "about:blank",
    title: "Method Not Allowed",
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function enforceRuntimeRateLimit(_input: {
  workspaceId: string;
  apiKeyId: string;
  operation: "query" | "record";
}) {
  // Deployment hook: v1 intentionally has no process-local rate limiter.
}
