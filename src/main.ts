import {
  type ChildProcess,
  type CommonSpawnOptions,
  spawn
} from 'node:child_process';
import {platform} from 'node:process';

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
  nodeOptions: CommonSpawnOptions;
  timeout: number;
  persist: boolean;
}

export interface TinyExec {
  (command: string, args?: string[], options?: Partial<Options>): Result;
}

const defaultOptions: Partial<Options> = {
  timeout: 10000,
  persist: false
};

export const tinyExec: TinyExec = (command, args, userOptions) => {
  const options = {
    ...defaultOptions,
    ...userOptions
  };

  try {
    const handle = spawn(command, args, options);
  } catch (err) {
    // TODO (jg): handle errors
    throw err;
  }
};
