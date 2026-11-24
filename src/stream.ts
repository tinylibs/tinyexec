import {type EventEmitter} from 'node:events';
import {pipeline} from 'node:stream/promises';
import {type Readable, PassThrough} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';

export const waitForEvent = (
  emitter: EventEmitter,
  name: string
): Promise<void> => {
  return new Promise((resolve) => {
    emitter.once(name, resolve);
  });
};

export const combineStreams = (streams: Readable[]): Readable => {
  let streamCount = streams.length;
  const combined = new PassThrough();
  const maybeEmitEnd = () => {
    if (--streamCount === 0) {
      combined.end();
    }
  };

  for (const stream of streams) {
    pipeline(stream, combined, {end: false})
      .then(maybeEmitEnd)
      .catch(maybeEmitEnd);
  }

  return combined;
};

export async function readStream(stream: Readable): Promise<string> {
  let output = '';
  const decoder = new StringDecoder();

  try {
    for await (const chunk of stream) {
      output += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    }
    output += decoder.end();
  } catch {
    // suppress errors, child process probably failed to spawn
  }

  return output;
}
