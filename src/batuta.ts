import {
  type Metric,
  type Scope,
  type Storage,
  Usage,
} from "./domain/index.js";

export class Batuta {
  readonly #storage: Storage;

  constructor(options: Batuta.Options) {
    this.#storage = options.storage;
  }

  async check(input: Batuta.Check.Input): Promise<Batuta.Check.Result> {
    const results = await this.#storage.usage({
      metric: input.metric,
      scopes: input.scopes,
      at: new Date(),
    });

    return {
      exceeded: results.some(({ quota, consumed }) => consumed >= quota.limit),
    };
  }

  async record(input: Batuta.Record.Input): Promise<void> {
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
  export type Options = {
    storage: Storage;
  };

  export namespace Check {
    export type Input = {
      metric: Metric;
      scopes: Scope[];
    };

    export type Result = {
      exceeded: boolean;
    };
  }

  export namespace Record {
    export type Input = {
      metric: Metric;
      scopes: Scope[];
      consumed: number;
    };
  }
}
