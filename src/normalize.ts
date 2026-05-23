import {type SpawnOptions} from 'node:child_process';
import {closeSync, openSync, readSync, statSync} from 'node:fs';
import {
  delimiter as pathDelimiter,
  normalize as normalizePath,
  resolve as resolvePath,
  basename
} from 'node:path';
import {cwd as getCwd} from 'node:process';
import {getPathFromEnv} from './env.js';

// See http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
const shebangRegExp = /^#!\s*(.+)/;
const isWindowsExecutableRegExp = /\.(?:com|exe)$/i;
const isNodeModulesCmdRegExp = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i;
const isWindows = process.platform === 'win32';
const defaultPathExt = ['.EXE', '.CMD', '.BAT', '.COM'];

interface NormalizedSpawnCommand {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
}

/**
 * Normalizes the command and arguments to work cross-platform.
 * On Windows, this basically handles things like shebangs, calling
 * `node_modules/.bin` commands, and escaping meta characters.
 * On other platforms, it just returns the command and arguments as-is.
 */
export function normalizeSpawnCommand(
  command: string,
  args: readonly string[] = [],
  options: SpawnOptions = {}
): NormalizedSpawnCommand {
  // Early return if use `shell` option or not on Windows.
  if (options.shell === true || !isWindows) {
    return {command, args, options};
  }

  // Detect & add support for shebangs
  let file = resolveCommand(command, options);
  let shebang: string | null = null;

  if (file !== null) {
    // Read the first 150 bytes from the file
    const size = 150;
    const buffer = Buffer.alloc(size);

    let fd: number | null = null;
    try {
      fd = openSync(file, 'r');
      readSync(fd, buffer, 0, size, 0);
    } catch {
      // do nothing, we'll just assume it's not a shebang
    } finally {
      if (fd !== null) {
        closeSync(fd);
      }
    }

    const match = buffer.toString().match(shebangRegExp);

    if (match !== null) {
      const line = match[1].trim();
      const separatorIndex = line.indexOf(' ');
      const path = separatorIndex !== -1 ? line.slice(0, separatorIndex) : line;
      const argument =
        separatorIndex !== -1 ? line.slice(separatorIndex + 1) : '';
      const binary = basename(path);

      shebang = binary === 'env' ? argument || null : binary;
    }
  }

  if (shebang !== null && file !== null) {
    args = [file, ...args];
    command = shebang;

    file = resolveCommand(command, options);
  }

  // We don't need a shell if the command filename is resolved and an executable
  if (file === null || !isWindowsExecutableRegExp.test(file)) {
    // Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
    // The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
    // Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
    // we need to double escape them
    const needsDoubleEscapeMetaChars =
      file !== null && isNodeModulesCmdRegExp.test(file);

    // Normalize posix paths into OS compatible paths (e.g.: foo/bar -> foo\bar)
    // This is necessary otherwise it will always fail with ENOENT in those cases
    command = normalizePath(command);

    // Escape command & arguments
    command = command.replace(metaCharsRegExp, '^$1');
    args = args.map((arg) => {
      // Algorithm below is based on https://qntm.org/cmd
      // It's slightly altered to disable JS backtracking to avoid hanging on specially crafted input
      // Please see https://github.com/moxystudio/node-cross-spawn/pull/160 for more information

      // Sequence of backslashes followed by a double quote:
      // double up all the backslashes and escape the double quote
      arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');

      // Sequence of backslashes followed by the end of the string
      // (which will become a double quote later):
      // double up all the backslashes
      arg = arg.replace(/(?=(\\+?)?)\1$/, '$1$1');

      // All other backslashes occur literally

      // Quote the whole thing:
      arg = `"${arg}"`;

      // Escape meta chars
      arg = arg.replace(metaCharsRegExp, '^$1');

      // Double escape meta chars if necessary
      if (needsDoubleEscapeMetaChars) {
        arg = arg.replace(metaCharsRegExp, '^$1');
      }

      return arg;
    });

    args = ['/d', '/s', '/c', `"${[command, ...args].join(' ')}"`];
    command = options.env?.comspec ?? 'cmd.exe';
    // Tell node's spawn that the arguments are already escaped
    options = {...options, windowsVerbatimArguments: true};
  }

  return {command, args, options};
}

/**
 * Resolves the command to an absolute path if possible.
 * Handles things like traversing PATH and adding extensions from PATHEXT
 */
function resolveCommand(command: string, options: SpawnOptions): string | null {
  const cwd = (options.cwd ?? getCwd()).toString();
  const env = options.env ?? process.env;
  const PATH = getPathFromEnv(env).value;

  const pathEnv =
    command.includes('/') || command.includes('\\')
      ? ['']
      : [cwd, ...PATH.split(pathDelimiter)];
  const pathExt = env.PATHEXT
    ? env.PATHEXT.split(pathDelimiter)
    : defaultPathExt;

  if (command.includes('.') && pathExt[0] !== '') {
    pathExt.unshift('');
  }

  for (const path of pathEnv) {
    const unquoted =
      path.startsWith('"') && path.endsWith('"') && path.length > 1
        ? path.slice(1, -1)
        : path;
    const dest = resolvePath(cwd, unquoted, command);

    for (const ext of pathExt) {
      const destWithExt = dest + ext;

      try {
        if (statSync(destWithExt).isFile()) {
          return destWithExt;
        }
      } catch {
        // do nothing, it didn't exist
      }
    }
  }

  return null;
}
