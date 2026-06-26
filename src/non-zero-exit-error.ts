import type {Output, CommonOutputApi} from './main.js';

export class NonZeroExitError extends Error {
  public readonly exitCode: number;

  public constructor(
    public readonly result: CommonOutputApi,
    public readonly output?: Output,
    command?: string,
    args?: readonly string[]
  ) {
    let target = 'The process';
    if (command) {
      const fullCommand = args?.length
        ? `${command} ${args.map((a) => (/[ "'`()]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`
        : command;
      target = `The command \`${fullCommand}\``;
    }

    // This error is normally only created when the exit code is non-nullable
    // and non-zero, so it must exist here. However, due to types compatibility,
    // we default to 1 in case.
    const exitCode = result.exitCode ?? 1;

    super(`${target} exited with a non-zero status (${exitCode})`);
    this.exitCode = exitCode;

    // `result` is usually passed the entire instance of the exec process
    // depending on the exec API so that handlers can interact with it fully.
    // As such, its log can be very large so we hide it by making it non-enumerable.
    Object.defineProperty(this, 'result', {
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
}
