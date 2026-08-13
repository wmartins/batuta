import { Metric } from "./metric.js";
import { Scope } from "./scope.js";

export namespace Usage {
  export type Synthetic<
    MetricName extends Metric<string>,
    ScopeKey extends Scope<string>["key"],
  > = {
    metric: MetricName;
    scope: Scope<ScopeKey>;
    amount: number;
    occurredAt: Date;
  };

  export function validate<
    const MetricName extends Metric<string>,
    const ScopeKey extends Scope<string>["key"],
  >(usage: Synthetic<MetricName, ScopeKey>): Synthetic<MetricName, ScopeKey> {
    Metric.validate(usage.metric);
    Scope.validate(usage.scope, "usage.scope");
    if (!Number.isFinite(usage.amount) || usage.amount === 0) {
      throw new TypeError("amount must be finite and non-zero");
    }
    if (!Number.isFinite(usage.occurredAt.getTime())) {
      throw new TypeError("usage.occurredAt must be a valid Date");
    }
    return usage;
  }
}
