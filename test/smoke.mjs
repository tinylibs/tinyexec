// A dependency-free smoke test for the built output, run against Node.js
// versions that the dev stack no longer supports (see #57).
//
// Everything here is deliberately plain: `node:assert` and a `for` loop, no
// test runner and no `node_modules`. Vitest, tsdown and the node test runner
// all fail or flake on 18.x, which is what made the previous attempt at this
// stall (#109) — importing `dist/` and nothing else is the one approach that
// does not drag the toolchain along.
//
// It covers the happy path only. The exhaustive suite runs on supported
// versions; this exists to prove the published bundle still imports and runs
// where `engines.node` claims it does.

import assert from 'node:assert';
import {x, xSync, exec, execSync, NonZeroExitError} from '../dist/main.mjs';

// `process.execPath` keeps every case shell- and platform-independent, so the
// same file runs unmodified on Windows.
const node = process.execPath;

const tests = [];
function test(name, fn) {
  tests.push({name, fn});
}

test('x() captures stdout and a zero exit code', async () => {
  const proc = x(node, ['-e', 'process.stdout.write("hello")']);
  const result = await proc;

  assert.strictEqual(result.stdout, 'hello');
  assert.strictEqual(result.stderr, '');
  assert.strictEqual(result.exitCode, 0);
  assert.strictEqual(proc.exitCode, 0);
  assert.strictEqual(proc.signalCode, null);
});

test('x() captures stderr', async () => {
  const result = await x(node, ['-e', 'process.stderr.write("oh no")']);

  assert.strictEqual(result.stdout, '');
  assert.strictEqual(result.stderr, 'oh no');
});

test('x() forwards arguments verbatim', async () => {
  const result = await x(node, [
    '-e',
    'process.stdout.write(process.argv.slice(1).join("|"))',
    'one',
    'two three'
  ]);

  assert.strictEqual(result.stdout, 'one|two three');
});

test('x() is async-iterable over output lines', async () => {
  const lines = [];
  for await (const line of x(node, [
    '-e',
    'console.log("first"); console.log("second")'
  ])) {
    lines.push(line);
  }

  assert.deepStrictEqual(lines, ['first', 'second']);
});

test('x() reports a non-zero exit code without throwing by default', async () => {
  const result = await x(node, ['-e', 'process.exit(3)']);

  assert.strictEqual(result.exitCode, 3);
});

test('x() throws NonZeroExitError when throwOnError is set', async () => {
  // `x()` returns a PromiseLike, not a Promise, so it is awaited inside an
  // async function rather than handed to assert.rejects directly.
  await assert.rejects(
    async () => {
      await x(node, ['-e', 'process.exit(3)'], {throwOnError: true});
    },
    (err) => {
      assert.ok(
        err instanceof NonZeroExitError,
        `expected a NonZeroExitError, got ${err && err.constructor.name}`
      );
      assert.strictEqual(err.exitCode, 3);
      return true;
    }
  );
});

test('x() passes env through to the child', async () => {
  const result = await x(node, ['-e', 'process.stdout.write(process.env.SMOKE)'], {
    nodeOptions: {env: {SMOKE: 'value'}}
  });

  assert.strictEqual(result.stdout, 'value');
});

test('xSync() captures stdout and a zero exit code', () => {
  const result = xSync(node, ['-e', 'process.stdout.write("hello sync")']);

  assert.strictEqual(result.stdout, 'hello sync');
  assert.strictEqual(result.exitCode, 0);
});

test('xSync() throws NonZeroExitError when throwOnError is set', () => {
  assert.throws(
    () => xSync(node, ['-e', 'process.exit(4)'], {throwOnError: true}),
    (err) => {
      assert.ok(
        err instanceof NonZeroExitError,
        `expected a NonZeroExitError, got ${err && err.constructor.name}`
      );
      assert.strictEqual(err.exitCode, 4);
      return true;
    }
  );
});

test('exec and execSync are exported as aliases', () => {
  assert.strictEqual(exec, x);
  assert.strictEqual(execSync, xSync);
});

const failures = [];

for (const {name, fn} of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures.push({name, err});
    console.log(`not ok - ${name}`);
  }
}

console.log(`\n${tests.length - failures.length}/${tests.length} passed`);

if (failures.length > 0) {
  for (const {name, err} of failures) {
    console.error(`\n${name}:`);
    console.error(err);
  }
  process.exit(1);
}

console.log(`smoke test passed on Node.js ${process.version}`);
