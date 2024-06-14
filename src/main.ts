import {type ChildProcess, type SpawnOptions, spawn} from 'node:child_process';
import {type Readable} from 'node:stream';
import {normalize as normalizePath} from 'node:path';
import {cwd as getCwd} from 'node:process';
import {computeEnv} from './env.js';
import {readStreamAsString, combineStreams} from './stream.js';

export interface Output {
  stderr: string;
  stdout: string;
}

export interface PipeOptions extends Options {}

export type KillSignal = Parameters<ChildProcess['kill']>[0];

export interface OutputApi extends AsyncIterable<string> {
  pipe(
    command: string,
    args?: string[],
    options?: Partial<PipeOptions>
  ): Result;
  process: ChildProcess | undefined;
  kill(signal?: KillSignal): boolean;

  // Getters
  get pid(): number | undefined;
  get aborted(): boolean;
  get killed(): boolean;
  get exitCode(): number | undefined;
}

export type Result = PromiseLike<Output> & OutputApi;

export interface Options {
  signal: AbortSignal;
  nodeOptions: SpawnOptions;
  timeout: number;
  persist: boolean;
  stdin: ExecProcess;
}

export interface TinyExec {
  (command: string, args?: string[], options?: Partial<Options>): Result;
}

const defaultOptions: Partial<Options> = {
  timeout: 4000,
  persist: false
};

const defaultNodeOptions: SpawnOptions = {
  windowsHide: true
};

function normaliseCommandAndArgs(
  command: string,
  args?: string[]
): {
  command: string;
  args: string[];
} {
  const normalisedPath = normalizePath(command);
  const normalisedArgs = args ?? [];

  return {
    command: normalisedPath,
    args: normalisedArgs
  };
}

export class ExecProcess implements Result {
  protected _process?: ChildProcess;
  protected _aborted: boolean = false;
  protected _options: Partial<Options>;
  protected _command: string;
  protected _args: string[];
  protected _resolveClose?: () => void;
  protected _processClosed: Promise<void>;

  public get process(): ChildProcess | undefined {
    return this._process;
  }

  public get pid(): number | undefined {
    return this._process?.pid;
  }

  public get exitCode(): number | undefined {
    if (this._process && this._process.exitCode !== null) {
      return this._process.exitCode;
    }
    return undefined;
  }

  public constructor(
    command: string,
    args?: string[],
    options?: Partial<Options>
  ) {
    this._options = {
      ...defaultOptions,
      ...options
    };
    this._command = command;
    this._args = args ?? [];
    this._processClosed = new Promise<void>((resolve) => {
      this._resolveClose = resolve;
    });
  }

  public kill(signal?: KillSignal): boolean {
    return this._process?.kill(signal) === true;
  }

  public get aborted(): boolean {
    return this._aborted;
  }

  public get killed(): boolean {
    return this._process?.killed === true;
  }

  public pipe(
    command: string,
    args?: string[],
    options?: Partial<PipeOptions>
  ): Result {
    return exec(command, args, {
      ...options,
      stdin: this
    });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    const proc = this._process;
    if (!proc) {
      return;
    }

    const sources: Readable[] = [];
    if (proc.stderr) {
      sources.push(proc.stderr);
    }
    if (proc.stdout) {
      sources.push(proc.stdout);
    }
    const combined = combineStreams(sources);

    for await (const chunk of combined) {
      yield chunk.toString();
    }

    await this._processClosed;
  }

  public then<TResult1 = Output, TResult2 = never>(
    onfulfilled?: ((value: Output) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return new Promise<TResult1 | TResult2>(async (resolve, reject) => {
      if (this._options?.stdin) {
        await this._options.stdin;
      }

      const proc = this._process;

      if (!proc) {
        reject(new Error('No process was started'));
        return;
      }

      const [stderr, stdout] = await Promise.all([
        proc.stderr && readStreamAsString(proc.stderr),
        proc.stdout && readStreamAsString(proc.stdout),
        this._processClosed
      ]);

      const result: Output = {
        stderr: stderr ?? '',
        stdout: stdout ?? ''
      };

      if (onfulfilled) {
        resolve(onfulfilled(result));
      } else {
        resolve(result as TResult1);
      }
    });
  }

  public spawn(): void {
    const cwd = getCwd();
    const options = this._options;
    const nodeOptions = {
      ...defaultNodeOptions,
      ...options.nodeOptions
    };

    if (options.timeout !== undefined) {
      nodeOptions.timeout = options.timeout;
    }

    if (options.signal !== undefined) {
      nodeOptions.signal = options.signal;
    }

    if (options.persist === true) {
      nodeOptions.detached = true;
    }

    nodeOptions.env = computeEnv(cwd, nodeOptions.env);

    const {command: normalisedCommand, args: normalisedArgs} =
      normaliseCommandAndArgs(this._command, this._args);

    let handle;

    try {
      handle = spawn(normalisedCommand, normalisedArgs, nodeOptions);
    } catch (err) {
      // TODO (jg): handle errors
      throw err;
    }

    this._process = handle;
    handle.once('error', this._onError);
    handle.once('close', this._onClose);

    if (options.stdin !== undefined && handle.stdin && options.stdin.process) {
      const {stdout} = options.stdin.process;
      if (stdout) {
        stdout.pipe(handle.stdin);
      }
    }
  }

  protected _onError = (err: Error): void => {
    if (err.name === 'AbortError') {
      this._aborted = true;
      return;
    }
    // TODO emit this somewhere
    throw err;
  };

  protected _onClose = (): void => {
    if (this._resolveClose) {
      this._resolveClose();
    }
  };
}

export const exec: TinyExec = (command, args, userOptions) => {
  const proc = new ExecProcess(command, args, userOptions);

  proc.spawn();

  return proc;
};
