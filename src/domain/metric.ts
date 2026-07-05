export type Metric = string;

export namespace Metric {
  export function validate(metric: Metric): Metric {
    if (metric.length === 0) {
      throw new TypeError("metric must be a non-empty string");
    }
    return metric;
  }
}
