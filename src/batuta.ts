import {
  type Metric,
  type Scope,
  type Storage,
  Usage,
} from "./domain/index.js";

export class Batuta<
  MetricName extends Metric = Metric,
  ScopeKey extends Scope["key"] = Scope["key"],
> {
  readonly #storage: Storage<MetricName, ScopeKey>;

  constructor(options: Batuta.Options<MetricName, ScopeKey>) {
    this.#storage = options.storage;
  }

  async check(
    input: Batuta.Check.Input<MetricName, ScopeKey>,
  ): Promise<Batuta.Check.Result> {
    const results = await this.#storage.usage({
      metric: input.metric,
      scopes: input.scopes,
      at: new Date(),
    });

    return {
      exceeded: results.some(({ quota, consumed }) => consumed >= quota.limit),
    };
  }

  async record(
    input: Batuta.Record.Input<MetricName, ScopeKey>,
  ): Promise<void> {
    const occurredAt = new Date();
    await this.#storage.record(
      input.scopes.map((scope) =>
        Usage.validate({
          metric: input.metric,
          scope,
          consumed: input.consumed,
          occurredAt,
        }),
      ),
    );
  }
}

export namespace Batuta {
  export type Options<
    MetricName extends Metric = Metric,
    ScopeKey extends Scope["key"] = Scope["key"],
  > = {
    storage: Storage<MetricName, ScopeKey>;
  };

  export namespace Check {
    export type Input<
      MetricName extends Metric = Metric,
      ScopeKey extends Scope["key"] = Scope["key"],
    > = {
      metric: MetricName;
      scopes: Scope<ScopeKey>[];
    };

    export type Result = {
      exceeded: boolean;
    };
  }

  export namespace Record {
    export type Input<
      MetricName extends Metric = Metric,
      ScopeKey extends Scope["key"] = Scope["key"],
    > = {
      metric: MetricName;
      scopes: Scope<ScopeKey>[];
      consumed: number;
    };
  }
}
