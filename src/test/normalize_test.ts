import {normalizeSpawnCommand} from '../normalize.js';
import {describe, test, expect} from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const isWindows = os.platform() === 'win32';
const fixturesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../test/fixtures'
);
const cwd = process.cwd();

describe('normalizeSpawnCommand', () => {
  test('return from arguments if `shell` option is `true`', () => {
    expect(normalizeSpawnCommand('node', ['-v'], {shell: true})).toEqual({
      command: 'node',
      args: ['-v'],
      options: {shell: true}
    });
    expect(
      normalizeSpawnCommand('nonexistent', ['somearg'], {shell: true})
    ).toEqual({
      command: 'nonexistent',
      args: ['somearg'],
      options: {shell: true}
    });
  });

  describe.runIf(isWindows)('windows only', () => {
    test('returns input as-is if command was resolved', () => {
      const normalized = normalizeSpawnCommand('node', ['-v'], {});

      expect(normalized).toEqual({
        command: 'node',
        args: ['-v'],
        options: {}
      });
    });

    test('use shell if command could not be resolved', () => {
      const normalized = normalizeSpawnCommand('nonexistent', ['hi'], {});

      expect(normalized).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', '"nonexistent ^"hi^""'],
        options: {windowsVerbatimArguments: true}
      });
    });

    test('handles relative commands', () => {
      const relativePath = path.relative(
        cwd,
        path.join(fixturesPath, 'hello_world.cmd')
      );
      const normalized = normalizeSpawnCommand(relativePath, []);
      expect(normalized).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', `"${relativePath}"`],
        options: {windowsVerbatimArguments: true}
      });
    });

    test('handles relative commands without extension', () => {
      const relativePath = path.relative(
        cwd,
        path.join(fixturesPath, 'hello_world')
      );
      const normalized = normalizeSpawnCommand(relativePath, []);
      expect(normalized).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', `"${relativePath}"`],
        options: {windowsVerbatimArguments: true}
      });
    });
  });

  describe.runIf(!isWindows)('unix only', () => {
    test('returns command as-is', () => {
      expect(normalizeSpawnCommand('node', ['-v'])).toEqual({
        command: 'node',
        args: ['-v'],
        options: {}
      });
      expect(normalizeSpawnCommand('nonexistent', ['somearg'])).toEqual({
        command: 'nonexistent',
        args: ['somearg'],
        options: {}
      });
    });
  });
});
