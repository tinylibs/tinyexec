import {combineStreams, waitForEvent} from '../stream.js';
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';

test('waitForEvent', async (t) => {
  await t.test('waits for event to fire', async () => {
    const emitter = new EventEmitter();
    const waiter = waitForEvent(emitter, 'foo');
    emitter.emit('foo');
    await waiter;
  });
});

test('combineStreams', async (t) => {
  await t.test('works with a single stream', async () => {
    const stream = Readable.from(['foo', 'bar']);
    const combined = combineStreams([stream]);
    const chunks: string[] = [];
    combined.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });
    await waitForEvent(combined, 'end');
    assert.deepEqual(chunks, ['foo', 'bar']);
  });

  await t.test('works with multiple streams', async () => {
    const stream0 = Readable.from(['foo']);
    const stream1 = Readable.from(['bar', 'baz']);
    const combined = combineStreams([stream0, stream1]);
    const chunks: string[] = [];
    combined.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });
    await waitForEvent(combined, 'end');
    assert.deepEqual(chunks, ['foo', 'bar', 'baz']);
  });
});
