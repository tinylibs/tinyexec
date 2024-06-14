import {type EventEmitter} from 'node:events';
import {type Readable, PassThrough} from 'node:stream';

export const readStreamAsString = (stream: Readable): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    let result = '';
    const onDataReceived = (chunk: Buffer | string): void => {
      result += chunk.toString();
    };

    stream.once('error', (err) => {
      reject(err);
    });

    stream.on('data', onDataReceived);

    stream.once('end', () => {
      stream.removeListener('data', onDataReceived);
      resolve(result);
    });
  });
};

export const waitForEvent = (
  emitter: EventEmitter,
  name: string
): Promise<void> => {
  return new Promise((resolve) => {
    emitter.on(name, resolve);
  });
};

export const combineStreams = (streams: Readable[]): Readable => {
  let streamCount = streams.length;
  const combined = new PassThrough();
  const maybeEmitEnd = () => {
    if (--streamCount === 0) {
      combined.emit('end');
    }
  };

  for (const stream of streams) {
    stream.pipe(combined, {end: false});
    stream.on('end', maybeEmitEnd);
  }

  return combined;
};
