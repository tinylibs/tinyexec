import * as path from 'node:path';
import {chdir} from 'node:process';
import which from 'which';
import {getPathFromEnv} from './env.js';
import {type ParsedShellOptions} from './shared-types.js';

function resolveCommandAttempt(
  parsed: ParsedShellOptions,
  withoutPathExt: boolean
): string | undefined {
  const env = parsed.options.env || process.env;
  const cwd = process.cwd();
  const hasCustomCwd = parsed.options.cwd != null;
  // Worker threads do not have process.chdir()
  const shouldSwitchCwd =
    hasCustomCwd &&
    chdir !== undefined &&
    !(chdir as typeof chdir & {disabled?: boolean}).disabled;

  // If a custom `cwd` was specified, we need to change the process cwd
  // because `which` will do stat calls but does not support a custom cwd
  if (shouldSwitchCwd && typeof parsed.options.cwd === 'string') {
    try {
      chdir(parsed.options.cwd);
    } catch (err) {
      /* Empty */
    }
  }

  let resolved;

  try {
    resolved = which.sync(parsed.command, {
      path: getPathFromEnv(env).value,
      pathExt: withoutPathExt ? path.delimiter : undefined
    });
  } catch (e) {
    /* Empty */
  } finally {
    if (shouldSwitchCwd) {
      chdir(cwd);
    }
  }

  // If we successfully resolved, ensure that an absolute path is returned
  // Note that when a custom `cwd` was used, we need to resolve to an absolute path based on it
  if (resolved) {
    resolved = path.resolve(
      hasCustomCwd && typeof parsed.options.cwd === 'string'
        ? parsed.options.cwd
        : '',
      resolved
    );
  }

  return resolved;
}

export function resolveCommand(parsed: ParsedShellOptions): string | undefined {
  return (
    resolveCommandAttempt(parsed, false) || resolveCommandAttempt(parsed, true)
  );
}
