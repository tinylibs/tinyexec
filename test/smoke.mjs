import assert from 'node:assert/strict';
import {execPath as node} from 'node:process';
import {x, xSync, NonZeroExitError} from '../dist/main.mjs';

const result = await x(node, ['-e', 'process.stdout.write("hello")']);
assert.equal(result.stdout, 'hello');
assert.equal(result.exitCode, 0);

const lines = [];
for await (const line of x(node, ['-e', 'console.log("a"); console.log("b")'])) {
  lines.push(line);
}
assert.deepEqual(lines, ['a', 'b']);

await assert.rejects(async () => {
  await x(node, ['-e', 'process.exit(3)'], {throwOnError: true});
}, NonZeroExitError);

const syncResult = xSync(node, ['-e', 'process.stdout.write("hello")']);
assert.equal(syncResult.stdout, 'hello');
assert.equal(syncResult.exitCode, 0);

console.log(`smoke test passed on Node.js ${process.version}`);
