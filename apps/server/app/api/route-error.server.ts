import { InvalidApiKeyError } from "../services/api-key.server";
import {
  IdempotencyConflictError,
  ManagedStorageValidationError,
} from "../services/managed-storage.server";
import {
  InvalidIdempotencyKeyError,
  MalformedJsonError,
  PayloadTooLargeError,
  problemResponse,
  RuntimeRateLimitError,
  UnsupportedMediaTypeError,
} from "./http.server";

export function runtimeErrorResponse(error: unknown, requestId: string) {
  if (error instanceof InvalidApiKeyError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:invalid-api-key",
      title: "Invalid API key",
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="batuta"' },
    });
  }
  if (error instanceof MalformedJsonError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:malformed-json",
      title: "Malformed JSON",
      status: 400,
    });
  }
  if (error instanceof PayloadTooLargeError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:payload-too-large",
      title: "Payload too large",
      status: 413,
    });
  }
  if (error instanceof UnsupportedMediaTypeError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:unsupported-media-type",
      title: "Unsupported media type",
      status: 415,
    });
  }
  if (error instanceof InvalidIdempotencyKeyError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:invalid-request",
      title: "Invalid request",
      status: 422,
      errors: [
        {
          path: "/headers/idempotency-key",
          code: "invalid",
          message: "Idempotency-Key must be 8 to 128 visible ASCII characters.",
        },
      ],
    });
  }
  if (error instanceof ManagedStorageValidationError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:invalid-request",
      title: "Invalid request",
      status: 422,
      errors: [{ path: error.path, code: error.code, message: error.message }],
    });
  }
  if (error instanceof IdempotencyConflictError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:idempotency-conflict",
      title: "Idempotency conflict",
      status: 409,
    });
  }
  if (error instanceof RuntimeRateLimitError) {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:rate-limited",
      title: "Rate limited",
      status: 429,
      headers: error.retryAfter
        ? { "Retry-After": error.retryAfter }
        : undefined,
    });
  }
  const code =
    error &&
    typeof error === "object" &&
    "cause" in error &&
    error.cause &&
    typeof error.cause === "object" &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
      ? error.cause.code
      : undefined;
  if (code?.startsWith("08") || code === "57P01" || code === "53300") {
    return problemResponse({
      requestId,
      type: "urn:batuta:problem:service-unavailable",
      title: "Service unavailable",
      status: 503,
    });
  }
  console.error({ requestId, error: "unexpected-runtime-api-failure" });
  return problemResponse({
    requestId,
    type: "urn:batuta:problem:internal",
    title: "Internal server error",
    status: 500,
  });
}
