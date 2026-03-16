import { x, xs, NonZeroExitError, type SyncResult, type Result } from '../main.js';
import { describe, test, expect } from 'vitest';
import os from 'node:os';

const isWindows = os.platform() === 'win32';

const variants = [{ name: 'async', x, isAsync: true }, { name: 'sync', x: xs, isAsync: false }];

describe.each(variants)('exec ($name)', async ({ x, isAsync }) => {
  test('pid is number', async () => {
    const proc = x('echo', ['foo']);
    await proc;
    expect(typeof proc.pid === 'number').ok;
  });

  test('exitCode is set correctly', async () => {
    const proc = x('echo', ['foo']);

    // only async API will have its exitCode set after awaiting
    // for sync API, by the time we reach here the process has already exited
    if (isAsync) {
      expect(proc.exitCode).toBe(undefined);
    }

    const result = await proc;
    expect(proc.exitCode).toBe(0);
    expect(result.exitCode).toBe(0);
  });

  test.runIf(isAsync)('(async) non-zero exitCode throws when throwOnError=true', async () => {
    const proc = x('node', ['-e', 'process.exit(1);'], { throwOnError: true });
    await expect(async () => {
      await proc;
    }).rejects.toThrow(NonZeroExitError);
    expect(proc.exitCode).toBe(1);
  });

  test.runIf(!isAsync)('(sync) non-zero exitCode does not throw even when throwOnError=true', () => {
    expect(() => {
      x('node', ['-e', 'process.exit(1);'], { throwOnError: true });
    }).toThrow();
  });

  test('async iterator gets correct output', async () => {
    const proc = x('node', ['-e', "console.log('foo'); console.log('bar');"]);
    const lines = [];
    for await (const line of proc) {
      lines.push(line);
    }

    expect(lines).toEqual(['foo', 'bar']);
  });

  test('resolves to stdout', async () => {
    const result = await x('node', ['-e', "console.log('foo')"]);
    expect(result.stdout).toBe('foo\n');
    expect(result.stderr).toBe('');
  });

  test('captures stderr', async () => {
    const result = await x('node', ['-e', "console.error('some error')"]);
    expect(result.stderr).toBe('some error\n');
    expect(result.stdout).toBe('');
  });
});

if (isWindows) {
  describe.each(variants)('exec (windows) ($name)', async ({ x, isAsync }) => {
    test.runIf(isAsync)('(async) times out after defined timeout (ms)', async () => {
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = x('ping', ['127.0.0.1', '-n', '2'], { timeout: 100 }) as Result;
      await expect(async () => {
        await proc;
      }).rejects.toThrow();
      expect(proc.killed).toBe(true);
      expect(proc.process!.signalCode).toBe('SIGTERM');
    });

    test.runIf(!isAsync)('(sync) times out after defined timeout (ms)', () => {
      expect(() => {
        x('ping', ['127.0.0.1', '-n', '2'], { timeout: 100 });
      }).toThrow();
    });

    test('does not throw spawn errors', async () => {
      const result = await x('definitelyNonExistent');
      expect(result.stderr).toBe(
        "'definitelyNonExistent' is not recognized as an internal" +
        ' or external command,\r\noperable program or batch file.\r\n'
      );
      expect(result.stdout).toBe('');
    });

    test('throws spawn errors when throwOnError=true', async () => {
      try {
        const proc = x('definitelyNonExistent', [], { throwOnError: true });
        await proc;
        expect.fail('Expected to throw');
      } catch (err) {
        expect(err instanceof NonZeroExitError).ok;
        expect((err as NonZeroExitError).output?.stderr).toBe(
          "'definitelyNonExistent' is not recognized as an internal" +
          ' or external command,\r\noperable program or batch file.\r\n'
        );
        expect((err as NonZeroExitError).output?.stdout).toBe('');
      }
    });

    test.runIf(isAsync)('kill terminates the process', async () => {
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = x('ping', ['127.0.0.1', '-n', '2']) as Result;
      const result = proc.kill();
      expect(result).ok;
      expect(proc.killed).ok;
      expect(proc.aborted).toBe(false);
    });

    test.runIf(isAsync)('pipe correctly pipes output', async () => {
      const echoProc = x('node', ['-e', "console.log('foo')"]) as Result;
      const grepProc = echoProc.pipe('findstr', ['f']);
      const result = await grepProc;

      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('foo\n');
      expect(result.exitCode).toBe(0);
      expect(echoProc.exitCode).toBe(0);
      expect(grepProc.exitCode).toBe(0);
    });

    test.runIf(isAsync)('signal can be used to abort execution', async () => {
      const controller = new AbortController();
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = x('ping', ['127.0.0.1', '-n', '2'], {
        signal: controller.signal
      }) as Result;
      controller.abort();
      const result = await proc;
      expect(proc.aborted).ok;
      expect(proc.killed).ok;
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('');
    });

    test.runIf(isAsync)('(async) async iterator receives errors as lines', async () => {
      const proc = x('nonexistentforsure') as Result;
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }

      expect(lines).toEqual([
        "'nonexistentforsure' is not recognized as an internal or " +
        'external command,',
        'operable program or batch file.'
      ]);
    });

    test.runIf(!isAsync)('(sync) async iterator receives errors as lines', () => {
      const proc = x('nonexistentforsure') as SyncResult;
      const lines: string[] = [];
      for (const line of proc) {
        lines.push(line);
      }

      expect(lines).toEqual([
        "'nonexistentforsure' is not recognized as an internal or " +
        'external command,',
        'operable program or batch file.'
      ]);
    });
  });
}

if (!isWindows) {
  describe.each(variants)('exec (unix-like) ($name)', async ({ x, isAsync }) => {
    test.runIf(isAsync)('(async) times out after defined timeout (ms)', async () => {
      const proc = x('sleep', ['0.2'], { timeout: 100 }) as Result;
      await expect(async () => {
        await proc;
      }).rejects.toThrow();
      expect(proc.killed).toBe(true);
      expect(proc.process!.signalCode).toBe('SIGTERM');
    });

    test.runIf(!isAsync)('(sync) times out after defined timeout (ms)', () => {
      expect(() => {
        x('sleep', ['0.2'], { timeout: 100 });
      }).toThrow();
    });

    test.runIf(isAsync)('(async) throws spawn errors', async () => {
      const proc = x('definitelyNonExistent');
      await expect(async () => {
        await proc;
      }).rejects.toThrow('spawn definitelyNonExistent ENOENT');
    });

    test.runIf(!isAsync)('(sync) throws spawn errors', () => {
      expect(() => {
        x('definitelyNonExistent');
      }).toThrow('spawnSync definitelyNonExistent ENOENT');
    });

    test.runIf(isAsync)('kill terminates the process', async () => {
      const proc = x('sleep', ['5']) as Result;
      const result = proc.kill();
      expect(result).ok;
      expect(proc.killed).ok;
      expect(proc.aborted).toBe(false);
    });

    test.runIf(isAsync)('pipe correctly pipes output', async () => {
      const echoProc = x('echo', ['foo\nbar']) as Result;
      const grepProc = echoProc.pipe('grep', ['foo']);
      const result = await grepProc;

      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('foo\n');
      expect(result.exitCode).toBe(0);
      expect(echoProc.exitCode).toBe(0);
      expect(grepProc.exitCode).toBe(0);
    });

    test.runIf(isAsync)('signal can be used to abort execution', async () => {
      const controller = new AbortController();
      const proc = x('sleep', ['4'], { signal: controller.signal }) as Result;
      controller.abort();
      const result = await proc;
      expect(proc.aborted).ok;
      expect(proc.killed).ok;
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('');
    });

    test.runIf(isAsync)('(async) async iterator receives errors', async () => {
      const proc = x('nonexistentforsure');
      await expect(async () => {
        for await (const line of proc) {
          line;
        }
      }).rejects.toThrow();
    });

    test.runIf(!isAsync)('(sync) async iterator receives errors', () => {
      expect(() => {
        x('nonexistentforsure');
      }).toThrow();
    });
  });
}
