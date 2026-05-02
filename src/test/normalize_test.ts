import {normalizeSpawnCommand} from '../normalize.js';
import {describe, test, expect} from 'vitest';
import os from 'node:os';

const isWindows = os.platform() === 'win32';
const baseWindowsOptions = {
  env: process.env
};

describe('normalizeSpawnCommand', () => {
  test('return from arguments if `shell` option is `true`', () => {
    expect(normalizeSpawnCommand('node', ['-v'], {shell: true})).toEqual({
      command: 'node',
      args: ['-v'],
      options: {shell: true}
    });
  });

  describe.runIf(isWindows)('windows only', () => {
    test('just return the same input if resolved', () => {
      const normalized = normalizeSpawnCommand(
        'node',
        ['-v'],
        baseWindowsOptions
      );

      expect(normalized.command).toBe('node');
      expect(normalized.args).toEqual(['-v']);
    });

    test('use shell if command are not resolved/available', () => {
      const normalized = normalizeSpawnCommand(
        'notexist',
        ['hi'],
        baseWindowsOptions
      );

      expect(normalized.command.endsWith('cmd.exe')).ok;
      expect(normalized.args).toEqual(['/d', '/s', '/c', '"notexist ^"hi^""']);
      expect(normalized.options.windowsVerbatimArguments).toBe(true);
    });
  });

  describe.runIf(!isWindows)('unix only', () => {
    test('return from arguments', () => {
      expect(normalizeSpawnCommand('node', ['-v'])).toEqual({
        command: 'node',
        args: ['-v'],
        options: {}
      });
    });
  });
});
