import {computeEnv, getPathFromEnv} from '../env.js';
import {expect, test, describe} from 'vitest';
import process from 'node:process';
import path, {sep as pathSep, delimiter as pathDelimiter} from 'node:path';

const pathKey = getPathFromEnv(process.env).key;

describe('computeEnv', async () => {
  test('adds node binaries to path', () => {
    const env = computeEnv(process.cwd());
    const path = env[pathKey]!;

    expect(path.includes(`node_modules${pathSep}.bin`)).ok;
  });

  test('extends process env', () => {
    const env = computeEnv(process.cwd(), {
      foo: 'bar'
    });

    for (const key in process.env) {
      if (key.toUpperCase() !== 'PATH') {
        expect(env[key]).toBe(process.env[key]);
      }
    }

    expect(env.foo).toBe('bar');
  });

  test('supports case-insensitive path keys', () => {
    const originalPath = process.env[pathKey];
    try {
      delete process.env[pathKey];
      const env = computeEnv(process.cwd(), {
        PatH: '/'
      });
      const keys = [...Object.keys(env)];

      expect(keys.includes('PatH')).ok;
      expect(!keys.includes(pathKey)).ok;
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

      expect(typeof env['PATH'] === 'string').ok;
      expect(env['PatH']).toBe(undefined);
    } finally {
      process.env[pathKey] = originalPath;
    }
  });

  test('uses default key if no path found', () => {
    const originalPath = process.env[pathKey];
    try {
      delete process.env[pathKey];
      const env = computeEnv(process.cwd());

      expect(typeof env['PATH'] === 'string').ok;
    } finally {
      process.env[pathKey] = originalPath;
    }
  });

  test('prepends local node_modules/.bin to PATH', () => {
    /** The original variable is just `PATH=/usr/local/bin` */
    const originalPath = path.join(pathSep, 'usr', 'local', 'bin');
    const cwd = path.resolve(pathSep, 'one', 'two', 'three');

    const env = computeEnv(cwd, {
      PATH: originalPath
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
     */
    const expected = [
      path.resolve(pathSep, 'one', 'two', 'three', 'node_modules', '.bin'),
      path.resolve(pathSep, 'one', 'two', 'node_modules', '.bin'),
      path.resolve(pathSep, 'one', 'node_modules', '.bin'),
      path.resolve(pathSep, 'node_modules', '.bin'),
      originalPath
    ].join(pathDelimiter);

    expect(env[pathKey]).toBe(expected);
  });
});
