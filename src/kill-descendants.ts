import {
  type ChildProcess,
  execFile,
  type SpawnOptions
} from 'node:child_process';
import {
  join as joinWindowsPath,
  parse as parseWindowsPath
} from 'node:path/win32';

type KillSignal = Parameters<ChildProcess['kill']>[0];
type KillFunction = (signal?: KillSignal) => boolean;

const isWindows = process.platform === 'win32';
const isWindowsDriveRootRegExp = /^[a-z]:[\\/]/i;

/**
 * Makes the subprocess lead its own process group, so a negative PID can
 * later signal the whole group. Windows has no process groups, so the
 * options come back untouched there.
 */
export function detachProcessGroup(options: SpawnOptions): SpawnOptions {
  return isWindows ? options : {...options, detached: true};
}

/**
 * Creates a replacement for `subprocess.kill` which takes the descendants
 * down too. It's best-effort: descendants which start their own group or
 * session survive, and Windows falls back to killing the direct child.
 */
export function createKillFunction(
  subprocess: ChildProcess,
  env: NodeJS.ProcessEnv = process.env
): KillFunction {
  // Capture the original method before the caller replaces it
  const kill = subprocess.kill.bind(subprocess);

  return (signal): boolean => {
    // Signal 0 is a liveness probe, not a termination.
    if (signal === 0) {
      return kill(signal);
    }

    if (subprocess.pid === undefined) {
      return false;
    }

    return isWindows
      ? killWindowsTree(subprocess.pid, signal, kill, env)
      : killProcessGroup(subprocess.pid, signal, kill);
  };
}

function killWindowsTree(
  pid: number,
  signal: KillSignal,
  kill: KillFunction,
  env: NodeJS.ProcessEnv
): boolean {
  const taskkillFile = resolveTaskkillPath(env);

  if (taskkillFile === undefined) {
    return kill(signal);
  }

  // taskkill must run before the direct child exits, or its descendants
  // might be orphaned before Windows can enumerate the process tree.
  execFile(taskkillFile, ['/pid', String(pid), '/T', '/F'], (error) => {
    if (error) {
      kill(signal);
    }
  });

  return true;
}

function killProcessGroup(
  pid: number,
  signal: KillSignal,
  kill: KillFunction
): boolean {
  try {
    // A negative PID signals the whole process group on Unix.
    return process.kill(-pid, signal);
  } catch {
    // group's gone, or we're not allowed to signal it
    return kill(signal);
  }
}

function resolveTaskkillPath(env: NodeJS.ProcessEnv): string | undefined {
  // Resolve the system binary directly instead of relying on PATH.
  const windowsDirectory = [env.SystemRoot, env.windir].find(
    (directory): directory is string =>
      directory !== undefined &&
      isWindowsDriveRootRegExp.test(parseWindowsPath(directory).root)
  );

  return windowsDirectory === undefined
    ? undefined
    : joinWindowsPath(windowsDirectory, 'System32', 'taskkill.exe');
}
