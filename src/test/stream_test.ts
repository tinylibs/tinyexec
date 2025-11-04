import {combineStreams, waitForEvent} from '../stream.js';
import {describe, test, expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';

describe('waitForEvent', async () => {
  test('waits for event to fire', async () => {
    const emitter = new EventEmitter();
    const waiter = waitForEvent(emitter, 'foo');
    emitter.emit('foo');
    await waiter;
  });
});

describe('combineStreams', async () => {
  test('works with a single stream', async () => {
    const stream = Readable.from(['foo', 'bar']);
    const combined = combineStreams([stream]);
    const chunks: string[] = [];
    combined.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });
    await waitForEvent(combined, 'end');
    expect(chunks).toEqual(['foo', 'bar']);
  });

  test('works with multiple streams', async () => {
    const stream0 = Readable.from(['foo']);
    const stream1 = Readable.from(['bar', 'baz']);
    const combined = combineStreams([stream0, stream1]);
    const chunks: string[] = [];
    combined.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });
    await waitForEvent(combined, 'end');
    expect(chunks).toEqual(['foo', 'bar', 'baz']);
  });
});
