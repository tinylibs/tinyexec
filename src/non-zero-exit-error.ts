import type {Output, CommonOutputApi} from './main.js';

export class NonZeroExitError extends Error {
  public get exitCode(): number | undefined {
    if (this.result.exitCode !== null) {
      return this.result.exitCode;
    }
    return undefined;
  }

  public constructor(
    public readonly result: CommonOutputApi,
    public readonly output?: Output
  ) {
    super(`Process exited with non-zero status (${result.exitCode})`);
  }
}
