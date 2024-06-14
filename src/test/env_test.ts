import {computeEnv} from '../env.js';
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import process from 'node:process';

test('computeEnv', async (t) => {
  await t.test('adds node binaries to path', () => {
    const env = computeEnv(process.cwd());
    const path = env['PATH']!;

    assert.ok(path.includes('node_modules/.bin'));
  });

  await t.test('extends process env', () => {
    const env = computeEnv(process.cwd(), {
      foo: 'bar'
    });

    for (const key in process.env) {
      if (key !== 'PATH') {
        assert.equal(env[key], process.env[key]);
      }
    }

    assert.equal(env.foo, 'bar');
  });

  await t.test('supports case-insensitive path keys', () => {
    const originalPath = process.env['PATH'];
    try {
      delete process.env['PATH'];
      const env = computeEnv(process.cwd(), {
        Path: '/'
      });
      const keys = [...Object.keys(env)];

      assert.ok(keys.includes('Path'));
      assert.ok(!keys.includes('PATH'));
    } finally {
      process.env['PATH'] = originalPath;
    }
  });

  await t.test('uses default key if empty path found', () => {
    const originalPath = process.env['PATH'];
    try {
      delete process.env['PATH'];
      const env = computeEnv(process.cwd(), {
        Path: undefined
      });

      assert.ok(typeof env['PATH'] === 'string');
      assert.equal(env['Path'], undefined);
    } finally {
      process.env['PATH'] = originalPath;
    }
  });

  await t.test('uses default key if no path found', () => {
    const originalPath = process.env['PATH'];
    try {
      delete process.env['PATH'];
      const env = computeEnv(process.cwd());

      assert.ok(typeof env['PATH'] === 'string');
    } finally {
      process.env['PATH'] = originalPath;
    }
  });
});
