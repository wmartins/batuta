import type { Metric } from "./metric.js";
import type { Quota } from "./quota.js";
import type { Scope } from "./scope.js";
import type { Usage } from "./usage.js";

export interface Storage {
  usage(input: Storage.Usage.Input): Promise<Storage.Usage.Result[]>;

  record(usages: readonly Usage.Synthetic[]): Promise<void>;
}

export namespace Storage {
  export namespace Usage {
    export type Input = {
      metric: Metric;
      scopes: Scope[];
      at: Date;
    };

    export type Result = {
      quota: Quota.Synthetic;
      scope: Scope;
      consumed: number;
    };
  }
}
