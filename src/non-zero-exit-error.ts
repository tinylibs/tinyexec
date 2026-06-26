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

    // This error is normally only created when the exit code is non-zero, so it
    // must exist here. However, due to types compatibility, we accept it being
    // nullable and default to 1 in case.
    const exitCode = result.exitCode ?? 1;

    super(`${target} exited with a non-zero status (${exitCode})`);
    this.exitCode = exitCode;

    // `result` is sometimes passed the entire child process object, which
    // results in very large logs as it used to be typed `Result`. However,
    // we don't manually subset it for now to keep compatibility.
    Object.defineProperty(this, 'result', {
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
}
