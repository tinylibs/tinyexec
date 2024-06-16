import {x} from '../main.js';
import * as assert from 'node:assert/strict';
import {test} from 'node:test';

test('exec', async (t) => {
  await t.test('resolves to stdout', async () => {
    const result = await x('echo', ['foo']);
    assert.equal(result.stdout, 'foo\n');
    assert.equal(result.stderr, '');
  });

  await t.test('times out after defined timeout (ms)', async () => {
    const proc = x('sleep', ['0.2s'], {timeout: 100});
    await assert.rejects(async () => {
      await proc;
    });
    assert.equal(proc.killed, true);
    assert.equal(proc.process!.signalCode, 'SIGTERM');
  });

  await t.test('throws spawn errors', async () => {
    const proc = x('definitelyNonExistent');
    await assert.rejects(async () => {
      await proc;
    }, 'spawn definitelyNonExistent NOENT');
  });

  await t.test('captures stderr', async () => {
    const result = await x('cat', ['nonexistentforsure']);
    assert.equal(
      result.stderr,
      'cat: nonexistentforsure: No such file or directory\n'
    );
    assert.equal(result.stdout, '');
  });

  await t.test('pid is number', async () => {
    const proc = x('echo', ['foo']);
    await proc;
    assert.ok(typeof proc.pid === 'number');
  });

  await t.test('exitCode is set correctly', async () => {
    const proc = x('echo', ['foo']);
    assert.equal(proc.exitCode, undefined);
    await proc;
    assert.equal(proc.exitCode, 0);
  });

  await t.test('kill terminates the process', async () => {
    const proc = x('sleep', ['5s']);
    const result = proc.kill();
    assert.ok(result);
    assert.ok(proc.killed);
    assert.equal(proc.aborted, false);
  });

  await t.test('pipe correctly pipes output', async () => {
    const echoProc = x('echo', ['foo\nbar']);
    const grepProc = echoProc.pipe('grep', ['foo']);
    const result = await grepProc;

    assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'foo\n');
    assert.equal(echoProc.exitCode, 0);
    assert.equal(grepProc.exitCode, 0);
  });

  await t.test('async iterator gets correct output', async () => {
    const proc = x('echo', ['foo\nbar']);
    const lines = [];
    for await (const line of proc) {
      lines.push(line);
    }

    assert.deepEqual(lines, ['foo', 'bar']);
  });

  await t.test('async iterator receives errors', async () => {
    const proc = x('nonexistentforsure');
    await assert.rejects(async () => {
      for await (const line of proc) {
        line;
      }
    });
  });

  await t.test('signal can be used to abort execution', async () => {
    const controller = new AbortController();
    const proc = x('sleep', ['4s'], {signal: controller.signal});
    controller.abort();
    const result = await proc;
    assert.ok(proc.aborted);
    assert.ok(proc.killed);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  });
});
