import {
  Batuta,
  Metric,
  Quota,
  Scope,
  type Storage,
  Usage,
  Window,
} from "batuta";
import { SQLite3Storage, type SQLite3StorageOptions } from "batuta/sqlite";

const core: typeof Batuta = Batuta;
const adapter: typeof SQLite3Storage = SQLite3Storage;
const storage = null as Storage<string, string> | null;
const options = null as SQLite3StorageOptions | null;

Metric.validate("credits");
Scope.validate({ key: "user", value: "user-1" }, "scope");
Window.validate({ amount: 1, unit: "day" });
Quota.validate({
  metric: "credits",
  scope: "user",
  limit: 10,
  window: { amount: 1, unit: "day" },
});
Usage.validate({
  metric: "credits",
  scope: { key: "user", value: "user-1" },
  consumed: 1,
  occurredAt: new Date(),
});

void core;
void adapter;
void storage;
void options;
