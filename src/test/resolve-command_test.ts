import {resolveCommand} from '../resolve-command.js';
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolve} from 'node:path';
import {cwd as getCwd} from 'node:process';

test('resolveCommand', async (t) => {
  await t.test('can resolve commands', () => {
    const cwd = getCwd();
    const resolved = resolveCommand({
      command: 'node',
      args: [],
      options: {}
    });

    assert.ok(resolved);
    assert.equal(cwd, getCwd());
  });

  await t.test('can resolve commands from custom cwd', () => {
    const cwd = getCwd();
    const resolved = resolveCommand({
      command: 'node',
      args: [],
      options: {cwd: resolve(cwd, './src')}
    });

    assert.ok(resolved);
    assert.equal(cwd, getCwd());
  });
});
