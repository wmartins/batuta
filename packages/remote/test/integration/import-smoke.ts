import {
  BatutaApiError,
  BatutaClient,
  type BatutaClientOptions,
  type BatutaStorage,
  BatutaTimeoutError,
} from "@batuta/remote";
import type { Storage } from "batuta";

const options = null as BatutaClientOptions | null;
const client: typeof BatutaClient = BatutaClient;
const storage: Storage<string, string> | null = null as BatutaStorage<
  string,
  string
> | null;
const apiError: typeof BatutaApiError = BatutaApiError;
const timeoutError: typeof BatutaTimeoutError = BatutaTimeoutError;

void options;
void client;
void storage;
void apiError;
void timeoutError;
