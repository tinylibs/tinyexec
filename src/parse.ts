import {type SpawnOptions} from 'node:child_process';
import {closeSync, openSync, readSync, statSync} from 'node:fs';
import {
  delimiter as pathDelimiter,
  normalize as normalizePath,
  resolve as resolvePath
} from 'node:path';
import {cwd as getCwd} from 'node:process';
import {getPathFromEnv, type EnvLike} from './env.js';

// See http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
const shebangRegExp = /^#!\s*(.+)$/;
const isWindowsExecutableRegExp = /\.(?:com|exe)$/i;
const isNodeModulesCmdRegExp = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i;
const isWindows = process.platform === 'win32';

interface CrossParseResult {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
}

// From https://github.com/moxystudio/node-cross-spawn (MIT)
export function parse(
  command: string,
  args: readonly string[] = [],
  options: SpawnOptions = {}
): CrossParseResult {
  // Build our parsed object
  const parsed: CrossParseResult = {
    command,
    args,
    options: {...options}
  };

  // Early return if use `shell` option or not on Windows.
  if (parsed.options.shell === true || !isWindows) {
    return parsed;
  }

  // Detect & add support for shebangs
  let file = resolveCommand(parsed);
  let shebang: string | null = null;

  if (file !== null) {
    // Read the first 150 bytes from the file
    const size = 150;
    const buffer = Buffer.alloc(size);

    try {
      const fd = openSync(file, 'r');
      readSync(fd, buffer, 0, size, 0);
      closeSync(fd);
    } catch {
      // do nothing, we'll just assume it's not a shebang
    }

    const match = buffer.toString().match(shebangRegExp);

    if (match !== null) {
      const line = match[1].trim();
      const separatorIndex = line.indexOf(' ');
      const path = separatorIndex !== -1 ? line.slice(0, separatorIndex) : line;
      const argument =
        separatorIndex !== -1 ? line.slice(separatorIndex + 1) : '';
      const binarySeparatorIndex = path.lastIndexOf('/');
      const binary =
        binarySeparatorIndex !== -1
          ? path.slice(binarySeparatorIndex + 1)
          : path;

      shebang = binary === 'env' ? argument || null : binary;
    }
  }

  if (shebang !== null && file !== null) {
    parsed.args = [file, ...parsed.args];
    parsed.command = shebang;

    file = resolveCommand(parsed);
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
    parsed.command = normalizePath(parsed.command);

    // Escape command & arguments
    parsed.command = parsed.command.replace(metaCharsRegExp, '^$1');
    parsed.args = parsed.args.map((arg) => {
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

    parsed.args = [
      '/d',
      '/s',
      '/c',
      `"${[parsed.command, ...parsed.args].join(' ')}"`
    ];
    parsed.command = parsed.options.env?.comspec ?? 'cmd.exe';
    parsed.options.windowsVerbatimArguments = true; // Tell node's spawn that the arguments are already escaped
  }

  return parsed;
}

// From https://github.com/npm/node-which (ISC), Windows part only and sync version.
function resolveCommand(parsed: CrossParseResult): string | null {
  const {command, options} = parsed;
  const cwd = (options.cwd ?? getCwd()).toString();
  const env = options.env ?? process.env;

  const PATH = getPathFromEnv(env).value;
  const PATHEXT = env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM';

  const pathEnv =
    command.includes('/') || command.includes('\\')
      ? ['']
      : [cwd, ...PATH.split(pathDelimiter)];
  const pathExt = PATHEXT.split(pathDelimiter);

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
