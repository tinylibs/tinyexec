import assert from 'node:assert';
import {describe, test} from 'node:test';

import {computeEnv, getPathFromEnv} from '../env.js';
import process from 'node:process';
import path, {sep as pathSep, delimiter as pathDelimiter} from 'node:path';

const pathKey = getPathFromEnv(process.env).key;

describe('computeEnv', () => {
  test('adds node binaries to path', () => {
    const env = computeEnv(process.cwd());
    const path = env[pathKey]!;

    assert.ok(path.includes(`node_modules${pathSep}.bin`));
  });

  test('extends process env', () => {
    const env = computeEnv(process.cwd(), {
      foo: 'bar'
    });

    for (const key in process.env) {
      if (key.toUpperCase() !== 'PATH') {
        assert.equal(env[key], process.env[key]);
      }
    }

    assert.equal(env.foo, 'bar');
  });

  test('supports case-insensitive path keys', () => {
    const originalPath = process.env[pathKey];
    try {
      delete process.env[pathKey];
      const env = computeEnv(process.cwd(), {
        PatH: '/'
      });
      const keys = [...Object.keys(env)];

      assert.ok(keys.includes('PatH'));
      assert.ok(!keys.includes(pathKey));
    } finally {
      process.env[pathKey] = originalPath;
    }
  });

  test('uses default key if empty path found', () => {
    const originalPath = process.env[pathKey];
    try {
      delete process.env[pathKey];
      const env = computeEnv(process.cwd(), {
        PatH: undefined
      });

      assert.ok(typeof env['PATH'] === 'string');
      assert.equal(env['PatH'], undefined);
    } finally {
      process.env[pathKey] = originalPath;
    }
  });

  test('uses default key if no path found', () => {
    const originalPath = process.env[pathKey];
    try {
      delete process.env[pathKey];
      const env = computeEnv(process.cwd());

      assert.ok(typeof env['PATH'] === 'string');
    } finally {
      process.env[pathKey] = originalPath;
    }
  });

  test('prepends local node_modules/.bin and directory of node executable to PATH', () => {
    /** The original variable is just `PATH=/usr/local/bin` */
    const originalPath = path.join(pathSep, 'usr', 'local', 'bin');
    const cwd = path.resolve(pathSep, 'one', 'two', 'three');

    const env = computeEnv(cwd, {
      [pathKey]: originalPath
    });

    /**
     * After computing, the PATH is now prefixed with all the `node_modules/.bin`
     * directories starting from the CWD=/one/two/three. This means local binaries
     * are preferred from the closest directory to the CWD, and are preferred to
     * the global ones from the existing path. Essentially, if `eslint` is installed
     * via `npm` to a local directory, it is preferred to a globally-installed `eslint`.
     *
     * This should match the behavior of `npm` path resolution algorithm used for
     * running scripts.
     *
     * @link https://github.com/npm/run-script/blob/08ad35e66f0d09ed7a6b85b9a457e54859b70acd/lib/set-path.js#L37
     *
     * Additionally, the directory of the current `node` process executable is added
     * to the PATH so that when spawning futher `node` processes, the same executable
     * is preferred. This improves behavior when using symlinked `node`, for example
     * with Node.js version managers and multiple different versions installed,
     * or when using Node.js installed from the Ubuntu Snap store. In both cases,
     * simply running `node` might end up with some other version of Node.js being
     * spawned.
     *
     * @link https://nodejs.org/api/process.html#processexecpath
     */
    const expected = [
      path.resolve(pathSep, 'one', 'two', 'three', 'node_modules', '.bin'),
      path.resolve(pathSep, 'one', 'two', 'node_modules', '.bin'),
      path.resolve(pathSep, 'one', 'node_modules', '.bin'),
      path.resolve(pathSep, 'node_modules', '.bin'),
      path.dirname(process.execPath),
      originalPath
    ].join(pathDelimiter);

    assert.deepEqual(env[pathKey], expected);
  });
});
