import {
  type ChildProcess,
  type CommonSpawnOptions,
  spawn
} from 'node:child_process';
import {
  normalize as normalizePath,
  delimiter as pathDelimiter,
  resolve as resolvePath,
  dirname
} from 'node:path';
import {cwd as getCwd} from 'node:process';

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
  get pid(): number | undefined;
  get aborted(): boolean;
  get killed(): boolean;
}

type Result = PromiseLike<Output> & OutputApi;

export interface Options {
  signal: AbortSignal;
  nodeOptions: CommonSpawnOptions;
  timeout: number;
  persist: boolean;
}

export interface TinyExec {
  (command: string, args?: string[], options?: Partial<Options>): Result;
}

const defaultOptions: Partial<Options> = {
  timeout: 4000,
  persist: false
};

const defaultNodeOptions: CommonSpawnOptions = {
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

type EnvLike = CommonSpawnOptions['env'];

interface EnvPathInfo {
  key: string;
  value: string;
}

const isPathLikePattern = /^path$/i;
const defaultEnvPathInfo = {key: 'PATH', value: ''};

function getPathFromEnv(env: EnvLike): EnvPathInfo {
  for (const key in env) {
    if (!Object.hasOwn(env, key) || !isPathLikePattern.test(key)) {
      continue;
    }

    const value = env[key];

    if (!value) {
      return defaultEnvPathInfo;
    }

    return {key, value};
  }
  return defaultEnvPathInfo;
}

function addNodeBinToPath(cwd: string, path: EnvPathInfo): EnvPathInfo {
  const parts = path.value.split(pathDelimiter);

  let currentPath = cwd;
  let lastPath: string;

  do {
    parts.push(resolvePath(currentPath, 'node_modules', '.bin'));
    lastPath = currentPath;
    currentPath = dirname(currentPath);
  } while (currentPath !== lastPath);

  return {key: path.key, value: parts.join(pathDelimiter)};
}

function computeEnv(cwd: string, env: EnvLike): EnvLike {
  const envPathInfo = addNodeBinToPath(cwd, getPathFromEnv(env));

  return {
    [envPathInfo.key]: envPathInfo.value
  };
}

export class ExecProcess implements Result {
  protected _process: ChildProcess;
  protected _aborted: boolean = false;

  public get process(): ChildProcess {
    return this._process;
  }

  public get pid(): number | undefined {
    return this._process.pid;
  }

  public constructor(proc: ChildProcess) {
    this._process = proc;
  }

  public kill(signal?: Parameters<ChildProcess['kill']>[0]): boolean {
    return this._process.kill(signal);
  }

  public get aborted(): boolean {
    return this._aborted;
  }

  public get killed(): boolean {
    return this._process.killed;
  }

  public pipe(command: string, args?: string[]): Result {
    // TODO (jg)
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    // TODO (jg)
  }

  public then<TResult1 = Output, TResult2 = never>(
    onfulfilled?: ((value: Output) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return new Promise<TResult1 | TResult2>((resolve, reject) => {
      const result: Output = {stderr: '', stdout: ''};
      if (onfulfilled) {
        resolve(onfulfilled(result));
      } else {
        resolve(result as TResult1);
      }
    });
  }
}

export const exec: TinyExec = (command, args, userOptions) => {
  const options = {
    ...defaultOptions,
    ...userOptions
  };
  const nodeOptions = {
    ...defaultNodeOptions,
    ...options.nodeOptions
  };

  if (options.timeout !== undefined) {
    nodeOptions.timeout = options.timeout;
  }

  const cwd = getCwd();

  nodeOptions.env = computeEnv(cwd, nodeOptions.env);

  const {command: normalisedCommand, args: normalisedArgs} =
    normaliseCommandAndArgs(command, args);

  let handle;

  try {
    handle = spawn(normalisedCommand, normalisedArgs, nodeOptions);
  } catch (err) {
    // TODO (jg): handle errors
    throw err;
  }

  return new ExecProcess(handle);
};
