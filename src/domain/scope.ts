export type Scope<Key extends string = string> = {
  key: Key;
  value: string;
};

export namespace Scope {
  export function validate<const Key extends string>(
    scope: Scope<Key>,
    name = "scope",
  ): Scope<Key> {
    if (scope.key.length === 0) {
      throw new TypeError(`${name}.key must be a non-empty string`);
    }
    if (scope.value.length === 0) {
      throw new TypeError(`${name}.value must be a non-empty string`);
    }
    return scope;
  }

  export function validateAll<const Key extends string>(
    scopes: readonly Scope<Key>[],
  ): readonly Scope<Key>[] {
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
