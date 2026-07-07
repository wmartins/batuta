import {
  BatutaApiError,
  BatutaClient,
  BatutaStorage,
  BatutaTimeoutError,
} from "@batuta/remote";

for (const value of [
  BatutaApiError,
  BatutaClient,
  BatutaStorage,
  BatutaTimeoutError,
]) {
  if (typeof value !== "function") {
    throw new TypeError("Expected a public @batuta/remote class export.");
  }
}
