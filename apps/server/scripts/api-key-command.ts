export function readArguments(argv: readonly string[]) {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    result.set(argument.slice(2), value);
    index += 1;
  }
  return result;
}

export function requireArgument(
  arguments_: ReadonlyMap<string, string>,
  name: string,
) {
  const value = arguments_.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

export function printCommandError(error: unknown) {
  const message = error instanceof Error ? error.message : "Command failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
