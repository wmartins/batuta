export class RegistryKeyConflictError extends Error {
  constructor(kind: "metric" | "scope") {
    super(`An active ${kind} already uses this key.`);
  }
}

export class RegistryDependencyError extends Error {
  constructor(
    public readonly kind: "metric" | "scope",
    public readonly count: number,
  ) {
    super(
      `Archive ${count} active ${count === 1 ? "quota" : "quotas"} before archiving this ${kind}.`,
    );
  }
}

export function hasPostgresCode(error: unknown, code: string) {
  if (!error || typeof error !== "object" || !("cause" in error)) return false;
  const { cause } = error;
  return (
    cause !== null &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === code
  );
}
