import type {Result, Output} from './main.js';

export class NonZeroExitError extends Error {
  public readonly result: Result;
  public readonly output?: Output;

  public get exitCode(): number | undefined {
    if (this.result.exitCode !== null) {
      return this.result.exitCode;
    }
    return undefined;
  }

  public constructor(result: Result, output?: Output) {
    super(`Process exited with non-zero status (${result.exitCode})`);

    this.result = result;
    this.output = output;
  }
}
