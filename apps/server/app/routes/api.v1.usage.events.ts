import { createHash } from "node:crypto";

import { authenticateRequest } from "~/api/authentication.server";
import {
  enforceRuntimeRateLimit,
  jsonResponse,
  methodNotAllowed,
  parseJson,
  problemResponse,
  readBoundedBody,
  requestIdFor,
  requireIdempotencyKey,
  requireJsonContentType,
  zodErrors,
} from "~/api/http.server";
import { runtimeErrorResponse } from "~/api/route-error.server";
import { db } from "~/data/db.server";
import { createManagedStorageService } from "~/services/managed-storage.server";
import { recordUsageEventsRequestSchema } from "~/validation/managed-storage-api";

import type { Route } from "./+types/api.v1.usage.events";

const managedStorage = createManagedStorageService(db);

export function loader({ request }: Route.LoaderArgs) {
  return methodNotAllowed(requestIdFor(request));
}

export async function action({ request }: Route.ActionArgs) {
  const receivedAt = new Date();
  const requestId = requestIdFor(request);
  if (request.method !== "POST") return methodNotAllowed(requestId);
  try {
    const identity = await authenticateRequest(request, receivedAt);
    requireJsonContentType(request);
    const idempotencyKey = requireIdempotencyKey(request);
    await enforceRuntimeRateLimit({
      workspaceId: identity.workspace.id,
      apiKeyId: identity.apiKey.id,
      operation: "record",
    });
    const body = await readBoundedBody(request);
    const requestHash = createHash("sha256").update(body).digest();
    const replay = await managedStorage.replay({
      workspaceId: identity.workspace.id,
      idempotencyKey,
      requestHash,
    });
    if (replay) {
      return jsonResponse(
        {
          batchId: replay.batchId,
          recorded: replay.recorded,
          occurredAt: replay.occurredAt.toISOString(),
        },
        {
          requestId,
          status: 200,
          headers: { "Idempotency-Replayed": "true" },
        },
      );
    }
    const parsed = recordUsageEventsRequestSchema.safeParse(parseJson(body));
    if (!parsed.success) {
      return problemResponse({
        requestId,
        type: "urn:batuta:problem:invalid-request",
        title: "Invalid request",
        status: 422,
        errors: zodErrors(parsed.error),
      });
    }
    const recorded = await managedStorage.record({
      workspaceId: identity.workspace.id,
      apiKeyId: identity.apiKey.id,
      idempotencyKey,
      requestHash,
      events: parsed.data.events,
      occurredAt: receivedAt,
    });
    return jsonResponse(
      {
        batchId: recorded.batchId,
        recorded: recorded.recorded,
        occurredAt: recorded.occurredAt.toISOString(),
      },
      {
        requestId,
        status: recorded.replayed ? 200 : 201,
        headers: recorded.replayed
          ? { "Idempotency-Replayed": "true" }
          : undefined,
      },
    );
  } catch (error) {
    return runtimeErrorResponse(error, requestId);
  }
}
