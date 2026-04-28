import {
  type ChildProcess,
  type SpawnOptions,
  spawn,
  spawnSync,
  type SpawnSyncOptions
} from 'node:child_process';
import {type Readable} from 'node:stream';
import {cwd as getCwd} from 'node:process';
import {computeEnv} from './env.js';
import {combineStreams} from './stream.js';
import readline from 'node:readline';
import {_parse} from 'cross-spawn';
import {NonZeroExitError} from './non-zero-exit-error.js';

export {NonZeroExitError};

const LINE_SEPARATOR_REGEX = /\r?\n/;

export interface Output {
  stderr: string;
  stdout: string;
  exitCode: number | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PipeOptions extends Options {}

export type KillSignal = Parameters<ChildProcess['kill']>[0];

export interface CommonOutputApi {
  get pid(): number | undefined;
  get killed(): boolean;
  get exitCode(): number | undefined;
}

export interface OutputApi extends AsyncIterable<string>, CommonOutputApi {
  process: ChildProcess | undefined;
  get aborted(): boolean;

  pipe(
    command: string,
    args?: readonly string[],
    options?: Partial<PipeOptions>
  ): Result;
  kill(signal?: KillSignal): boolean;
}

export interface OutputApiSync extends Iterable<string>, CommonOutputApi {}

export type Result = PromiseLike<Output> & OutputApi;

export type SyncResult = Output & OutputApiSync;

export interface CommonOptions {
  timeout: number;
  throwOnError: boolean;
}

export interface Options extends CommonOptions {
  signal: AbortSignal;
  nodeOptions: SpawnOptions;
  persist: boolean;
  stdin: Result | ExecProcess | string;
}

export interface SyncOptions extends CommonOptions {
  nodeOptions: SpawnSyncOptions;
}

export interface TinyExec {
  (
    command: string,
    args?: readonly string[],
    options?: Partial<Options>
  ): Result;
}

const defaultOptions: Partial<Options> = {
  timeout: undefined,
  persist: false
};

const defaultSyncOptions: Partial<SyncOptions> = {
  timeout: undefined
};

const defaultNodeOptions: SpawnOptions = {
  windowsHide: true
};

function combineSignals(signals: Iterable<AbortSignal>): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return signal;
    }

    const onAbort = (): void => {
      controller.abort(signal.reason);
    };
    signal.addEventListener('abort', onAbort, {
      signal: controller.signal
    });
  }

  return controller.signal;
}

async function readStream(stream: Readable): Promise<string> {
  let output = '';

  try {
    for await (const chunk of stream) {
      output += chunk.toString();
    }
  } catch {
    // suppress errors, child process probably failed to spawn
  }

  return output;
}

export class ExecProcess implements Result {
  protected _process?: ChildProcess;
  protected _aborted: boolean = false;
  protected _options: Partial<Options>;
  protected _command: string;
  protected _args: readonly string[];
  protected _resolveClose?: () => void;
  protected _processClosed: Promise<void>;
  protected _thrownError?: Error;

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
    args?: readonly string[],
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
    args?: readonly string[],
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

    const streams: Readable[] = [];

    if (this._streamErr) {
      streams.push(this._streamErr);
    }
    if (this._streamOut) {
      streams.push(this._streamOut);
    }

    const streamCombined = combineStreams(streams);

    const rl = readline.createInterface({
      input: streamCombined
    });

    for await (const chunk of rl) {
      yield chunk.toString();
    }

    await this._processClosed;

    proc.removeAllListeners();

    if (this._thrownError) {
      throw this._thrownError;
    }

    if (
      this._options?.throwOnError &&
      this.exitCode !== 0 &&
      this.exitCode !== undefined
    ) {
      throw new NonZeroExitError(this);
    }
  }

  protected async _waitForOutput(): Promise<Output> {
    const proc = this._process;

    if (!proc) {
      throw new Error('No process was started');
    }

    const [stdout, stderr] = await Promise.all([
      this._streamOut ? readStream(this._streamOut) : '',
      this._streamErr ? readStream(this._streamErr) : ''
    ]);

    await this._processClosed;

    const {stdin} = this._options;

    if (stdin && typeof stdin !== 'string') {
      await stdin;
    }

    proc.removeAllListeners();

    if (this._thrownError) {
      throw this._thrownError;
    }

    const result: Output = {
      stderr,
      stdout,
      exitCode: this.exitCode
    };

    if (
      this._options.throwOnError &&
      this.exitCode !== 0 &&
      this.exitCode !== undefined
    ) {
      throw new NonZeroExitError(this, result);
    }

    return result;
  }

  public then<TResult1 = Output, TResult2 = never>(
    onfulfilled?: ((value: Output) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._waitForOutput().then(onfulfilled, onrejected);
  }

  protected _streamOut?: Readable;
  protected _streamErr?: Readable;

  public spawn(): void {
    const cwd = getCwd();
    const options = this._options;
    const nodeOptions = {
      ...defaultNodeOptions,
      ...options.nodeOptions
    };
    const signals: AbortSignal[] = [];

    this._resetState();

    if (options.timeout !== undefined) {
      signals.push(AbortSignal.timeout(options.timeout));
    }

    if (options.signal !== undefined) {
      signals.push(options.signal);
    }

    if (options.persist === true) {
      nodeOptions.detached = true;
    }

    if (signals.length > 0) {
      nodeOptions.signal = combineSignals(signals);
    }

    nodeOptions.env = computeEnv(cwd, nodeOptions.env);

    const crossResult = _parse(this._command, this._args, nodeOptions);

    const handle = spawn(
      crossResult.command,
      crossResult.args,
      crossResult.options
    );

    if (handle.stderr) {
      this._streamErr = handle.stderr;
    }
    if (handle.stdout) {
      this._streamOut = handle.stdout;
    }

    this._process = handle;
    handle.once('error', this._onError);
    handle.once('close', this._onClose);

    if (handle.stdin) {
      const {stdin} = options;

      if (typeof stdin === 'string') {
        handle.stdin.end(stdin);
      } else {
        stdin?.process?.stdout?.pipe(handle.stdin);
      }
    }
  }

  protected _resetState(): void {
    this._aborted = false;
    this._processClosed = new Promise<void>((resolve) => {
      this._resolveClose = resolve;
    });
    this._thrownError = undefined;
  }

  protected _onError = (err: Error): void => {
    if (
      err.name === 'AbortError' &&
      (!(err.cause instanceof Error) || err.cause.name !== 'TimeoutError')
    ) {
      this._aborted = true;
      return;
    }
    this._thrownError = err;
  };

  protected _onClose = (): void => {
    if (this._resolveClose) {
      this._resolveClose();
    }
  };
}

export function xSync(
  command: string,
  args?: readonly string[],
  options?: Partial<SyncOptions>
): SyncResult {
  const opts = {...defaultSyncOptions, ...options};
  const cwd = getCwd();
  const nodeOptions: SpawnSyncOptions = {
    windowsHide: true,
    ...opts.nodeOptions
  };

  if (opts.timeout !== undefined) {
    nodeOptions.timeout = opts.timeout;
  }

  nodeOptions.env = computeEnv(cwd, nodeOptions.env);

  const crossResult = _parse(command, args ?? [], nodeOptions);

  const spawnResult = spawnSync(
    crossResult.command,
    crossResult.args,
    crossResult.options
  );

  if (spawnResult.error) {
    throw spawnResult.error;
  }

  const stdout = spawnResult.stdout?.toString() ?? '';
  const stderr = spawnResult.stderr?.toString() ?? '';
  const exitCode = spawnResult.status ?? undefined;
  const killed = spawnResult.signal != null;

  const result: SyncResult = {
    stdout,
    stderr,
    get exitCode() {
      return exitCode;
    },
    get pid() {
      return spawnResult.pid;
    },
    get killed() {
      return killed;
    },
    *[Symbol.iterator]() {
      for (const text of [stdout, stderr]) {
        if (!text) continue;
        const lines = text.split(LINE_SEPARATOR_REGEX);
        if (lines[lines.length - 1] === '') lines.pop();
        yield* lines;
      }
    }
  };

  if (opts.throwOnError && exitCode !== 0 && exitCode !== undefined) {
    throw new NonZeroExitError(result, result);
  }

  return result;
}

export const x: TinyExec = (command, args, userOptions) => {
  const proc = new ExecProcess(command, args, userOptions);

  proc.spawn();

  return proc;
};

export const exec = x;
export const execSync = xSync;
