import {parse} from '../parse.js';
import {describe, test, expect} from 'vitest';
import os from 'node:os';

const isWindows = os.platform() === 'win32';

describe('parse', () => {
  test('return from arguments if `shell` option is `true`', () => {
    expect(parse('node', ['-v'], {shell: true})).toEqual({
      command: 'node',
      args: ['-v'],
      options: {shell: true}
    });
  });

  if (isWindows) {
    // Add Windows tests later
  } else {
    test('return from arguments', () => {
      expect(parse('node', ['-v'])).toEqual({
        command: 'node',
        args: ['-v'],
        options: {}
      });
    });
  }
});
