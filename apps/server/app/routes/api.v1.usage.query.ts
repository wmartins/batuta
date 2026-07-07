import { authenticateRequest } from "~/api/authentication.server";
import {
  enforceRuntimeRateLimit,
  jsonResponse,
  methodNotAllowed,
  parseJson,
  problemResponse,
  readBoundedBody,
  requestIdFor,
  requireJsonContentType,
  zodErrors,
} from "~/api/http.server";
import { runtimeErrorResponse } from "~/api/route-error.server";
import { db } from "~/data/db.server";
import { createManagedStorageService } from "~/services/managed-storage.server";
import { queryUsageRequestSchema } from "~/validation/managed-storage-api";

import type { Route } from "./+types/api.v1.usage.query";

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
    await enforceRuntimeRateLimit({
      workspaceId: identity.workspace.id,
      apiKeyId: identity.apiKey.id,
      operation: "query",
    });
    const parsed = queryUsageRequestSchema.safeParse(
      parseJson(await readBoundedBody(request)),
    );
    if (!parsed.success) {
      return problemResponse({
        requestId,
        type: "urn:batuta:problem:invalid-request",
        title: "Invalid request",
        status: 422,
        errors: zodErrors(parsed.error),
      });
    }
    const results = await managedStorage.query({
      workspaceId: identity.workspace.id,
      ...parsed.data,
      evaluatedAt: receivedAt,
    });
    return jsonResponse(
      { evaluatedAt: receivedAt.toISOString(), results },
      { requestId, status: 200 },
    );
  } catch (error) {
    return runtimeErrorResponse(error, requestId);
  }
}
