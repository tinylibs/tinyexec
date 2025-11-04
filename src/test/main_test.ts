import {x, NonZeroExitError} from '../main.js';
import {describe, test, expect} from 'vitest';
import os from 'node:os';

const isWindows = os.platform() === 'win32';

describe('exec', async () => {
  test('pid is number', async () => {
    const proc = x('echo', ['foo']);
    await proc;
    expect(typeof proc.pid === 'number').ok;
  });

  test('exitCode is set correctly', async () => {
    const proc = x('echo', ['foo']);
    expect(proc.exitCode).toBe(undefined);
    const result = await proc;
    expect(proc.exitCode).toBe(0);
    expect(result.exitCode).toBe(0);
  });

  test('non-zero exitCode throws when throwOnError=true', async () => {
    const proc = x('node', ['-e', 'process.exit(1);'], {throwOnError: true});
    await expect(async () => {
      await proc;
    }).rejects.toThrow(NonZeroExitError);
    expect(proc.exitCode).toBe(1);
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
  describe('exec (windows)', async () => {
    test('times out after defined timeout (ms)', async () => {
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = x('ping', ['127.0.0.1', '-n', '2'], {timeout: 100});
      await expect(async () => {
        await proc;
      }).rejects.toThrow();
      expect(proc.killed).toBe(true);
      expect(proc.process!.signalCode).toBe('SIGTERM');
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
      const proc = x('definitelyNonExistent', [], {throwOnError: true});
      try {
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

    test('kill terminates the process', async () => {
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = x('ping', ['127.0.0.1', '-n', '2']);
      const result = proc.kill();
      expect(result).ok;
      expect(proc.killed).ok;
      expect(proc.aborted).toBe(false);
    });

    test('pipe correctly pipes output', async () => {
      const echoProc = x('node', ['-e', "console.log('foo')"]);
      const grepProc = echoProc.pipe('findstr', ['f']);
      const result = await grepProc;

      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('foo\n');
      expect(result.exitCode).toBe(0);
      expect(echoProc.exitCode).toBe(0);
      expect(grepProc.exitCode).toBe(0);
    });

    test('signal can be used to abort execution', async () => {
      const controller = new AbortController();
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = x('ping', ['127.0.0.1', '-n', '2'], {
        signal: controller.signal
      });
      controller.abort();
      const result = await proc;
      expect(proc.aborted).ok;
      expect(proc.killed).ok;
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('');
    });

    test('async iterator receives errors as lines', async () => {
      const proc = x('nonexistentforsure');
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
  });
}

if (!isWindows) {
  describe('exec (unix-like)', async () => {
    test('times out after defined timeout (ms)', async () => {
      const proc = x('sleep', ['0.2'], {timeout: 100});
      await expect(async () => {
        await proc;
      }).rejects.toThrow();
      expect(proc.killed).toBe(true);
      expect(proc.process!.signalCode).toBe('SIGTERM');
    });

    test('throws spawn errors', async () => {
      const proc = x('definitelyNonExistent');
      await expect(async () => {
        await proc;
      }).rejects.toThrow('spawn definitelyNonExistent ENOENT');
    });

    test('kill terminates the process', async () => {
      const proc = x('sleep', ['5']);
      const result = proc.kill();
      expect(result).ok;
      expect(proc.killed).ok;
      expect(proc.aborted).toBe(false);
    });

    test('pipe correctly pipes output', async () => {
      const echoProc = x('echo', ['foo\nbar']);
      const grepProc = echoProc.pipe('grep', ['foo']);
      const result = await grepProc;

      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('foo\n');
      expect(result.exitCode).toBe(0);
      expect(echoProc.exitCode).toBe(0);
      expect(grepProc.exitCode).toBe(0);
    });

    test('signal can be used to abort execution', async () => {
      const controller = new AbortController();
      const proc = x('sleep', ['4'], {signal: controller.signal});
      controller.abort();
      const result = await proc;
      expect(proc.aborted).ok;
      expect(proc.killed).ok;
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('');
    });

    test('async iterator receives errors', async () => {
      const proc = x('nonexistentforsure');
      await expect(async () => {
        for await (const line of proc) {
          line;
        }
      }).rejects.toThrow();
    });
  });
}
