export type Scope = {
  key: string;
  value: string;
};

export namespace Scope {
  export function validate(scope: Scope, name = "scope"): Scope {
    if (scope.key.length === 0) {
      throw new TypeError(`${name}.key must be a non-empty string`);
    }
    if (scope.value.length === 0) {
      throw new TypeError(`${name}.value must be a non-empty string`);
    }
    return scope;
  }

  export function validateAll(scopes: readonly Scope[]): readonly Scope[] {
    if (scopes.length === 0) {
      throw new TypeError("scopes must contain at least one scope");
    }

    const seen = new Set<string>();
    for (const [index, scope] of scopes.entries()) {
      validate(scope, `scopes[${index}]`);
      const identity = JSON.stringify([scope.key, scope.value]);
      if (seen.has(identity)) {
        throw new TypeError(
          "scopes must not contain duplicate key/value pairs",
        );
      }
      seen.add(identity);
    }
    return scopes;
  }
}
