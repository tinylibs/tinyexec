import type {Output} from './main.js';

interface ExitCodeable {
  readonly exitCode: number | null | undefined;
  readonly pid?: number | undefined;
}

export class NonZeroExitError extends Error {
  public get exitCode(): number | undefined {
    if (this.result.exitCode !== null) {
      return this.result.exitCode;
    }
    return undefined;
  }

  public constructor(
    public readonly result: ExitCodeable,
    public readonly output?: Output
  ) {
    super(`Process exited with non-zero status (${result.exitCode})`);
  }
}
