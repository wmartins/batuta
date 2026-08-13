import { Metric } from "./metric.js";
import { Scope } from "./scope.js";
import { Window } from "./window.js";

export type Limit = number | "unlimited";

export namespace Quota {
  type Base<
    MetricName extends Metric<string>,
    ScopeKey extends Scope<string>["key"],
  > = {
    metric: MetricName;
    scope: ScopeKey | Scope<ScopeKey>;
    limit: Limit;
  };

  export type Direct<
    MetricName extends Metric<string>,
    ScopeKey extends Scope<string>["key"],
  > = Base<MetricName, ScopeKey> & { type: "direct" };

  export type Balance<
    MetricName extends Metric<string>,
    ScopeKey extends Scope<string>["key"],
  > = Base<MetricName, ScopeKey> & { type: "balance" };

  export type Rolling<
    MetricName extends Metric<string>,
    ScopeKey extends Scope<string>["key"],
  > = Base<MetricName, ScopeKey> & {
    type: "rolling";
    window: Window.Value;
  };

  export type Synthetic<
    MetricName extends Metric<string>,
    ScopeKey extends Scope<string>["key"],
  > =
    | Direct<MetricName, ScopeKey>
    | Balance<MetricName, ScopeKey>
    | Rolling<MetricName, ScopeKey>;

  namespace Base {
    export function validate<
      const MetricName extends Metric<string>,
      const ScopeKey extends Scope<string>["key"],
      const Value extends Base<MetricName, ScopeKey>,
    >(quota: Value): Value {
      Metric.validate(quota.metric);
      if (typeof quota.scope === "string") {
        if (quota.scope.length === 0) {
          throw new TypeError("quota.scope must be a non-empty string");
        }
      } else {
        Scope.validate(quota.scope, "quota.scope");
      }
      if (
        quota.limit !== "unlimited" &&
        (!Number.isFinite(quota.limit) || quota.limit < 0)
      ) {
        throw new TypeError(
          'quota.limit must be finite and non-negative or "unlimited"',
        );
      }
      return quota;
    }
  }

  export function validate<
    const MetricName extends Metric<string>,
    const ScopeKey extends Scope<string>["key"],
    const Value extends Synthetic<MetricName, ScopeKey>,
  >(quota: Value): Value {
    Base.validate(quota);
    if (quota.type === "rolling") Window.validate(quota.window);
    return quota;
  }
}
