export namespace Window {
  export type Unit = "minute" | "hour" | "day" | "week";

  export type Value = {
    amount: number;
    unit: Unit;
  };

  export function validate(window: Value): Value {
    if (!Number.isInteger(window.amount) || window.amount <= 0) {
      throw new TypeError("window.amount must be a positive integer");
    }
    return window;
  }
}
