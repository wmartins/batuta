export type Metric<Name extends string> = Name;

export namespace Metric {
  export function validate<const Name extends string>(
    metric: Metric<Name>,
  ): Metric<Name> {
    if (metric.length === 0) {
      throw new TypeError("metric must be a non-empty string");
    }
    return metric;
  }
}
