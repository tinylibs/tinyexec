import {
  type ChildProcess
} from 'node:child_process';

export interface ToFileOptions {
  stderr: boolean;
  stdout: boolean;
}

const defaultToFileOptions: ToFileOptions = {
  stderr: true,
  stdout: true
};

export interface Output {
  stderr: string;
  stdout: string;
}

export interface PipeOptions extends Options {
  from: string;
  to: string;
  signal: AbortSignal;
}

export interface OutputApi extends AsyncIterable<string> {
  toFile(path: string, options?: Partial<ToFileOptions>): Promise<void>;
  pipe(
    command: string,
    args?: string[],
    options?: Partial<PipeOptions>
  ): Result;
  process: ChildProcess;
  kill(signal: number): boolean;

  // Getters
  get pid(): number;
  get cancelled(): boolean;
  get killed(): boolean;
}

type Result = PromiseLike<Output> & OutputApi;

export interface Options {
  inputFile: string;
  signal: AbortSignal;
}

export interface TinyExec {
  (
    command: string,
    args?: string[],
    options?: Options
  ): Result;
}
