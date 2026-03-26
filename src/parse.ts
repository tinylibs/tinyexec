import {type SpawnOptions} from 'node:child_process';
import {closeSync, openSync, readSync, statSync} from 'node:fs';
import {
  delimiter as pathDelimiter,
  normalize as normalizePath,
  resolve as resolvePath,
  sep as pathSeparator
} from 'node:path';

// See http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

export interface CrossParseResult {
  command: string;
  args: string[];
  options: SpawnOptions;
}

// From https://github.com/moxystudio/node-cross-spawn (MIT)
export function parse(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {}
): CrossParseResult {
  // Build our parsed object
  const parsed: CrossParseResult = {
    command,
    args: [...args],
    options: {...options}
  };

  // Early return if use `shell` option or not on Windows.
  if (parsed.options.shell === true || process.platform !== 'win32') {
    return parsed;
  }

  parsed.options.cwd ??= process.cwd();

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
    } catch {} // eslint-disable-line no-empty

    // From https://github.com/kevva/shebang-command (MIT)
    const match = buffer.toString().match(/^#!(.*)/);

    if (match !== null) {
      const [path, argument] = match[0].replace(/#! ?/, '').split(' ');
      const binary = path.split('/').pop();

      shebang = binary === 'env' ? argument : binary;
    }
  }

  if (shebang !== null) {
    parsed.args.unshift(file);
    parsed.command = shebang;

    file = resolveCommand(parsed);
  }

  // We don't need a shell if the command filename is an executable
  if (!/\.(?:com|exe)$/i.test(file)) {
    // Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
    // The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
    // Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
    // we need to double escape them
    const needsDoubleEscapeMetaChars =
      /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(file);

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
    parsed.command = parsed.options.env.comspec ?? 'cmd.exe';
    parsed.options.windowsVerbatimArguments = true; // Tell node's spawn that the arguments are already escaped
  }

  return parsed;
}

// From https://github.com/npm/node-which (ISC), Windows part only and sync version.
function resolveCommand(parsed: CrossParseResult): string | null {
  const {command, options} = parsed;
  const PATH = options.env.Path ?? options.env.PATH;
  const PATHEXT = options.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM';

  const pathEnv = command.includes(pathSeparator)
    ? ['']
    : [options.cwd, ...PATH.split(pathDelimiter)];
  const pathExt = PATHEXT.split(pathDelimiter);

  if (command.includes('.') && pathExt[0] !== '') {
    pathExt.unshift('');
  }

  for (const path of pathEnv) {
    const dest = resolvePath(path.replace(/^"(.*)"$/, '$1'), command);

    for (const ext of pathExt) {
      const destWithExt = dest + ext;

      try {
        if (statSync(destWithExt).isFile()) {
          return resolvePath(options.cwd, destWithExt);
        }
      } catch {} // eslint-disable-line no-empty
    }
  }

  return null;
}
