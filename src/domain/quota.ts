import { Metric } from "./metric.js";
import type { Scope } from "./scope.js";
import { Window } from "./window.js";

export namespace Quota {
  export type Synthetic = {
    metric: Metric;
    scope: Scope["key"];
    limit: number;
    window: Window.Value;
  };

  export function validate(quota: Synthetic): Synthetic {
    Metric.validate(quota.metric);
    if (quota.scope.length === 0) {
      throw new TypeError("quota.scope must be a non-empty string");
    }
    if (!Number.isFinite(quota.limit) || quota.limit < 0) {
      throw new TypeError("quota.limit must be finite and non-negative");
    }
    Window.validate(quota.window);
    return quota;
  }
}
