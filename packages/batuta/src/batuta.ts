import { Metric, Scope, type Storage, Usage } from "./domain/index.js";

export class Batuta<
  MetricName extends Metric<string>,
  ScopeKey extends Scope<string>["key"],
> {
  readonly #storage: Storage<MetricName, ScopeKey>;

  constructor(options: Batuta.Options<MetricName, ScopeKey>) {
    this.#storage = options.storage;
  }

  async check(
    input: Batuta.Check.Input<MetricName, ScopeKey>,
  ): Promise<Batuta.Check.Result> {
    Metric.validate(input.metric);
    Scope.validateAll(input.scopes);
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      throw new TypeError("amount must be finite and non-negative");
    }
    const results = await this.#storage.usage({
      metric: input.metric,
      scopes: input.scopes,
      at: new Date(),
    });

    return {
      exceeded: results.some((result) => {
        if (result.quota.limit === "unlimited") return false;
        const projected =
          "used" in result ? result.used + input.amount : input.amount;
        return projected > result.quota.limit;
      }),
    };
  }

  async record(
    input: Batuta.Record.Input<MetricName, ScopeKey>,
  ): Promise<void> {
    Metric.validate(input.metric);
    Scope.validateAll(input.scopes);
    const occurredAt = new Date();
    await this.#storage.record(
      input.scopes.map((scope) =>
        Usage.validate({
          metric: input.metric,
          scope,
          amount: input.amount,
          occurredAt,
        }),
      ),
    );
  }
}

export namespace Batuta {
  export type Options<
    MetricName extends Metric<string>,
    ScopeKey extends Scope<string>["key"],
  > = {
    storage: Storage<MetricName, ScopeKey>;
  };

  export namespace Check {
    export type Input<
      MetricName extends Metric<string>,
      ScopeKey extends Scope<string>["key"],
    > = {
      metric: MetricName;
      scopes: Scope<ScopeKey>[];
      amount: number;
    };

    export type Result = {
      exceeded: boolean;
    };
  }

  export namespace Record {
    export type Input<
      MetricName extends Metric<string>,
      ScopeKey extends Scope<string>["key"],
    > = {
      metric: MetricName;
      scopes: Scope<ScopeKey>[];
      amount: number;
    };
  }
}
