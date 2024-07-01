import {computeEnv} from '../env.js';
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';
import {sep as pathSep} from 'node:path';

const pathKey = 'Path' in process.env ? 'Path' : 'PATH';

test('computeEnv', async (t) => {
  await t.test('adds node binaries to path', () => {
    const env = computeEnv(process.cwd());
    const path = env[pathKey]!;

    assert.ok(path.includes(`node_modules${pathSep}.bin`));
  });

  await t.test('extends process env', () => {
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

  await t.test('supports case-insensitive path keys', () => {
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

  await t.test('uses default key if empty path found', () => {
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

  await t.test('uses default key if no path found', () => {
    const originalPath = process.env[pathKey];
    try {
      delete process.env[pathKey];
      const env = computeEnv(process.cwd());

      assert.ok(typeof env['PATH'] === 'string');
    } finally {
      process.env[pathKey] = originalPath;
    }
  });
});
