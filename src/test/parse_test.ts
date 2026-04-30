import {parse} from '../parse.js';
import {describe, test, expect} from 'vitest';
import os from 'node:os';

const isWindows = os.platform() === 'win32';
const baseWindowsOptions = {
  env: process.env
};

describe('parse', () => {
  test('return from arguments if `shell` option is `true`', () => {
    expect(parse('node', ['-v'], {shell: true})).toEqual({
      command: 'node',
      args: ['-v'],
      options: {shell: true}
    });
  });

  test.runIf(isWindows)('just return the same input if resolved', () => {
    const parsed = parse('node', ['-v'], baseWindowsOptions);

    expect(parsed.command).toBe('node');
    expect(parsed.args).toEqual(['-v']);
  });

  test.runIf(isWindows)(
    'use shell if command are not resolved/available',
    () => {
      const parsed = parse('notexist', ['hi'], baseWindowsOptions);

      expect(parsed.command.endsWith('cmd.exe')).ok;
      expect(parsed.args).toEqual(['/d', '/s', '/c', '"notexist ^"hi^""']);
      expect(parsed.options.windowsVerbatimArguments).toBe(true);
    }
  );

  test.runIf(!isWindows)('return from arguments', () => {
    expect(parse('node', ['-v'])).toEqual({
      command: 'node',
      args: ['-v'],
      options: {}
    });
  });
});
