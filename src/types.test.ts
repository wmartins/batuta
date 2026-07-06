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
    }>();
    expectTypeOf(batuta.record).parameter(0).toEqualTypeOf<{
      metric: AppMetric;
      scopes: AppScope[];
      consumed: number;
    }>();

    if (Date.now() < 0) {
      // @ts-expect-error validation context must be explicit
      Scope.validate({ key: "user", value: "user-123" });
      // @ts-expect-error metrics are restricted by the client configuration
      void batuta.check({ metric: "requests", scopes: [] });
      void batuta.record({
        metric: "credits",
        // @ts-expect-error scope keys are restricted by the client configuration
        scopes: [{ key: "workspace", value: "workspace-123" }],
        consumed: 1,
      });
    }
  });
});
