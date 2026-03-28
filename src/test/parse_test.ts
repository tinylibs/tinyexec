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
    // TODO: add more tests
    const baseOptions = {
      env: process.env
    };

    test('just return the same input if resolved', () => {
      const parsed = parse('node', ['-v'], baseOptions);

      expect(parsed.command).toBe('node');
      expect(parsed.args).toEqual(['-v']);
    });

    test('use shell if command are not resolved/available', () => {
      const parsed = parse('notexist', ['hi'], baseOptions);

      expect(parsed.command.endsWith('cmd.exe')).ok;
      expect(parsed.args).toEqual(['/d', '/s', '/c', '"notexist ^"hi^""']);
      expect(parsed.options.windowsVerbatimArguments).toBe(true);
    });
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
