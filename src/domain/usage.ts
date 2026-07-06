import { Metric } from "./metric.js";
import { Scope } from "./scope.js";

export namespace Usage {
  export type Synthetic<
    MetricName extends Metric = Metric,
    ScopeKey extends Scope["key"] = Scope["key"],
  > = {
    metric: MetricName;
    scope: Scope<ScopeKey>;
    consumed: number;
    occurredAt: Date;
  };

  export function validate<
    const MetricName extends Metric,
    const ScopeKey extends Scope["key"],
  >(usage: Synthetic<MetricName, ScopeKey>): Synthetic<MetricName, ScopeKey> {
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
