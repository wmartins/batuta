import type { Storage, Usage } from "batuta";

import { BatutaClient, type BatutaClientOptions } from "./client.js";

export class BatutaStorage<MetricName extends string, ScopeKey extends string>
  implements Storage<MetricName, ScopeKey>
{
  readonly client: BatutaClient;

  constructor(options: BatutaClientOptions) {
    this.client = new BatutaClient(options);
  }

  async usage(
    input: Storage.Usage.Input<MetricName, ScopeKey>,
  ): Promise<Storage.Usage.Result<MetricName, ScopeKey>[]> {
    if (input.scopes.length === 0) return [];
    const response = await this.client.queryUsage({
      metric: input.metric,
      scopes: input.scopes,
    });
    return response.results as Storage.Usage.Result<MetricName, ScopeKey>[];
  }

  async record(
    usages: readonly Usage.Synthetic<MetricName, ScopeKey>[],
  ): Promise<void> {
    if (usages.length === 0) return;
    await this.client.recordUsage(
      usages.map(({ metric, scope, consumed }) => ({
        metric,
        scope,
        consumed,
      })),
    );
  }
}
