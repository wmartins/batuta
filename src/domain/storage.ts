import type { Metric } from "./metric.js";
import type { Quota } from "./quota.js";
import type { Scope } from "./scope.js";
import type { Usage } from "./usage.js";

export interface Storage<
  MetricName extends Metric<string>,
  ScopeKey extends Scope<string>["key"],
> {
  usage(
    input: Storage.Usage.Input<MetricName, ScopeKey>,
  ): Promise<Storage.Usage.Result<MetricName, ScopeKey>[]>;

  record(
    usages: readonly Usage.Synthetic<MetricName, ScopeKey>[],
  ): Promise<void>;
}

export namespace Storage {
  export namespace Usage {
    export type Input<
      MetricName extends Metric<string>,
      ScopeKey extends Scope<string>["key"],
    > = {
      metric: MetricName;
      scopes: Scope<ScopeKey>[];
      at: Date;
    };

    export type Result<
      MetricName extends Metric<string>,
      ScopeKey extends Scope<string>["key"],
    > = {
      quota: Quota.Synthetic<MetricName, ScopeKey>;
      scope: Scope<ScopeKey>;
      consumed: number;
    };
  }
}
