import { db } from "../data/db.server";
import { env } from "../data/env.server";
import {
  createApiKeyService,
  InvalidApiKeyError,
} from "../services/api-key.server";

const apiKeys = createApiKeyService({
  database: db,
  pepper: Buffer.from(env.API_KEY_PEPPER_V1, "base64url"),
});

export async function authenticateRequest(request: Request, at: Date) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new InvalidApiKeyError();
  const value = authorization.slice("Bearer ".length);
  if (!value || value.includes(" ")) throw new InvalidApiKeyError();
  return apiKeys.authenticate(value, at);
}
