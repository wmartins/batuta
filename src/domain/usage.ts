import { Metric } from "./metric.js";
import { Scope } from "./scope.js";

export namespace Usage {
  export type Synthetic = {
    metric: Metric;
    scope: Scope;
    consumed: number;
    occurredAt: Date;
  };

  export function validate(usage: Synthetic): Synthetic {
    Metric.validate(usage.metric);
    Scope.validate(usage.scope);
    if (!Number.isFinite(usage.consumed) || usage.consumed <= 0) {
      throw new TypeError("consumed must be finite and greater than zero");
    }
    if (!Number.isFinite(usage.occurredAt.getTime())) {
      throw new TypeError("usage.occurredAt must be a valid Date");
    }
    return usage;
  }
}
