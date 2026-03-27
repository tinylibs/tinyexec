import {type EventEmitter} from 'node:events';
import {pipeline} from 'node:stream/promises';
import {type Readable, PassThrough} from 'node:stream';

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
