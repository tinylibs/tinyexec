import {computeEnv, getPathFromEnv} from '../env.js';
import {expect, test, describe} from 'vitest';
import process from 'node:process';
import {sep as pathSep} from 'node:path';

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
});
