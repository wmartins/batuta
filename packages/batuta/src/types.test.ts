import { describe, expectTypeOf, it } from "vitest";
import { Batuta, Metric, Scope, type Storage } from "./index.js";

type AppMetric = Metric<"credits" | "tokens">;
type AppScope = Scope<"user" | "company">;

describe("configured domain types", () => {
  it("preserves literals through validation", () => {
    expectTypeOf(Metric.validate("credits")).toEqualTypeOf<"credits">();
    expectTypeOf(
      Scope.validate({ key: "user", value: "user-123" }, "scope"),
    ).toEqualTypeOf<Scope<"user">>();
  });

  it("narrows client inputs", () => {
    const storage = {} as Storage<AppMetric, AppScope["key"]>;
    const batuta = new Batuta<AppMetric, AppScope["key"]>({ storage });

    expectTypeOf(batuta.check).parameter(0).toEqualTypeOf<{
      metric: AppMetric;
      scopes: AppScope[];
      amount: number;
    }>();
    expectTypeOf(batuta.record).parameter(0).toEqualTypeOf<{
      metric: AppMetric;
      scopes: AppScope[];
      amount: number;
    }>();

    if (Date.now() < 0) {
      // @ts-expect-error validation context must be explicit
      Scope.validate({ key: "user", value: "user-123" });
      // @ts-expect-error metrics are restricted by the client configuration
      void batuta.check({ metric: "requests", scopes: [], amount: 1 });
      void batuta.record({
        metric: "credits",
        // @ts-expect-error scope keys are restricted by the client configuration
        scopes: [{ key: "workspace", value: "workspace-123" }],
        amount: 1,
      });
    }
  });

  it("discriminates storage results by accumulated usage presence", () => {
    type Result = Storage.Usage.Result<AppMetric, AppScope["key"]>;
    type Accumulated = Extract<Result, { used: number }>;
    type Direct = Exclude<Result, Accumulated>;

    expectTypeOf<Accumulated["used"]>().toEqualTypeOf<number>();
    expectTypeOf<Accumulated["quota"]["type"]>().toEqualTypeOf<
      "balance" | "rolling"
    >();
    expectTypeOf<Direct["quota"]["type"]>().toEqualTypeOf<"direct">();
  });
});
