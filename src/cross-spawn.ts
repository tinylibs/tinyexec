import * as path from 'node:path';
import {env} from 'node:process';
import {type SpawnOptions} from 'node:child_process';
import {openSync, readSync, closeSync} from 'node:fs';
import {resolveCommand} from './resolve-command.js';
import {escapeArgument, escapeCommand} from './escape-command.js';
import {type ParsedShellOptions} from './shared-types.js';
import shebangCommand from 'shebang-command';

const isWin = process.platform === 'win32';
const isExecutableRegExp = /\.(?:com|exe)$/i;
const isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;

function readShebang(command: string): string | null {
  // Read the first 150 bytes from the file
  const size = 150;
  const buffer = Buffer.alloc(size);

  let fd;

  try {
    fd = openSync(command, 'r');
    readSync(fd, buffer, 0, size, 0);
    closeSync(fd);
  } catch (e) {
    /* Empty */
  }

  // Attempt to extract shebang (null is returned if not a shebang)
  return shebangCommand(buffer.toString());
}

module.exports = readShebang;

function detectShebang(parsed: ParsedShellOptions): string | undefined {
  const file = resolveCommand(parsed);

  const shebang = file && readShebang(file);

  if (shebang) {
    parsed.args.unshift(file);
    parsed.command = shebang;

    return resolveCommand(parsed);
  }

  return file;
}

function parseNonShell(parsed: ParsedShellOptions): ParsedShellOptions {
  if (!isWin) {
    return parsed;
  }

  // Detect & add support for shebangs
  const commandFile = detectShebang(parsed) ?? parsed.command;

  // We don't need a shell if the command filename is an executable
  const needsShell = !isExecutableRegExp.test(commandFile);

  // If a shell is required, use cmd.exe and take care of escaping everything correctly
  if (needsShell) {
    // Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
    // The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
    // Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
    // we need to double escape them
    const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);

    // Normalize posix paths into OS compatible paths (e.g.: foo/bar -> foo\bar)
    // This is necessary otherwise it will always fail with ENOENT in those cases
    parsed.command = path.normalize(parsed.command);

    // Escape command & arguments
    parsed.command = escapeCommand(parsed.command);
    parsed.args = parsed.args.map((arg) =>
      escapeArgument(arg, needsDoubleEscapeMetaChars)
    );

    const shellCommand = [parsed.command].concat(parsed.args).join(' ');

    parsed.args = ['/d', '/s', '/c', `"${shellCommand}"`];
    parsed.command = env.comspec || 'cmd.exe';
    parsed.options.windowsVerbatimArguments = true; // Tell node's spawn that the arguments are already escaped
  }

  return parsed;
}

export function parse(command: string, args: string[], options: SpawnOptions) {
  if (options.shell) {
    return {command, args, options};
  }

  const argsCopy = args.slice(0);
  const optionsCopy = {...options};

  // Build our parsed object
  const parsed: ParsedShellOptions = {
    command,
    args: argsCopy,
    options: optionsCopy
  };

  return parseNonShell(parsed);
}
