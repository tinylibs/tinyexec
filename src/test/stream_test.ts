import {combineStreams, waitForEvent, readStreamAsString} from '../stream.js';
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

test('readStreamAsString', async (t) => {
  await t.test('rejects on error', async () => {
    const streamError = new Error('fudge');
    const stream = new Readable({
      read() {
        this.destroy(streamError);
      }
    });
    await assert.rejects(readStreamAsString(stream), streamError);
  });

  await t.test('resolves to concatenated data', async () => {
    const stream = Readable.from(['foo', 'bar']);
    const result = await readStreamAsString(stream);
    assert.equal(result, 'foobar');
  });

  await t.test('handles buffer data', async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.from('foo'));
        this.push(Buffer.from('bar'));
        this.push(null);
      }
    });
    const result = await readStreamAsString(stream);
    assert.equal(result, 'foobar');
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
