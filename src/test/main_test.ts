import assert from 'node:assert';
import os from 'node:os';
import {describe, test} from 'node:test';

import {
  exec,
  execSync,
  ExecProcess,
  NonZeroExitError
} from '../../dist/main.mjs';

const isWindows = os.platform() === 'win32';
const isBun = !!process.versions.bun;

describe('exec', () => {
  test('pid is number', async () => {
    const proc = exec('echo', ['foo']);
    await proc;
    assert.ok(typeof proc.pid === 'number');
  });

  test('exitCode is set correctly', async () => {
    const proc = exec('echo', ['foo']);

    // only async API will have its exitCode undefined before awaiting;
    // for sync API the process has already exited by the time we reach here
    assert.equal(proc.exitCode, undefined);

    const result = await proc;
    assert.equal(proc.exitCode, 0);
    assert.equal(result.exitCode, 0);
  });

  test('async iterator gets correct output', async () => {
    const proc = exec('node', [
      '-e',
      "console.log('foo'); console.log('bar');"
    ]);
    const lines = [];
    for await (const line of proc) {
      lines.push(line);
    }

    assert.deepEqual(lines, ['foo', 'bar']);
  });

  test('resolves to stdout', async () => {
    const result = await exec('node', ['-e', "console.log('foo')"]);
    assert.equal(result.stdout, 'foo\n');
    assert.equal(result.stderr, '');
  });

  test('captures stderr', async () => {
    const result = await exec('node', ['-e', "console.error('some error')"]);
    assert.equal(result.stderr, 'some error\n');
    assert.equal(result.stdout, '');
  });

  test('non-zero exitCode throws when throwOnError=true', async () => {
    const proc = exec('node', ['-e', 'process.exit(1);'], {throwOnError: true});
    await assert.rejects(async () => {
      await proc;
    }, NonZeroExitError);
    assert.equal(proc.exitCode, 1);
  });

  test('supports stdin passed as a string', async () => {
    let result = await exec(
      'node',
      ['-e', 'process.stdin.pipe(process.stdout)'],
      {
        stdin: 'foo\nbar'
      }
    );

    assert.equal(result.stdout, 'foo\nbar');
    assert.equal(result.stderr, '');
    assert.equal(result.exitCode, 0);

    // Ensuring that empty string doesn’t cause issues
    result = await exec(
      'node',
      ['-e', "process.stdout.write(String(fs.readFileSync(0,'utf8').length))"],
      {stdin: ''}
    );

    assert.equal(result.stdout, '0');
    assert.equal(result.stderr, '');
    assert.equal(result.exitCode, 0);
  });

  test('supports stdin passed as another process (Result)', async () => {
    const proc = exec('node', ['-e', "process.stdout.write('foo\\nbar')"]);
    const result = await exec(
      'node',
      ['-e', 'process.stdin.pipe(process.stdout)'],
      {stdin: proc}
    );

    assert.equal(result.stdout, 'foo\nbar');
    assert.equal(result.stderr, '');
    assert.equal(result.exitCode, 0);
  });

  test('supports stdin passed as another process (ExecProcess)', async () => {
    const proc = new ExecProcess('node', [
      '-e',
      "process.stdout.write('foo\\nbar')"
    ]);
    proc.spawn();

    const result = await exec(
      'node',
      ['-e', 'process.stdin.pipe(process.stdout)'],
      {stdin: proc}
    );

    assert.equal(result.stdout, 'foo\nbar');
    assert.equal(result.stderr, '');
    assert.equal(result.exitCode, 0);
  });
});

describe('execSync', () => {
  test('pid is number', async () => {
    const result = execSync('echo', ['foo']);
    assert.ok(typeof result.pid === 'number');
  });

  test('exitCode is set correctly', async () => {
    const result = execSync('echo', ['foo']);
    assert.equal(result.exitCode, 0);
  });

  test('async iterator gets correct output', async () => {
    const result = execSync('node', [
      '-e',
      "console.log('foo'); console.log('bar');"
    ]);
    const lines = [];
    for await (const line of result) {
      lines.push(line);
    }

    assert.deepEqual(lines, ['foo', 'bar']);
  });

  test('resolves to stdout', async () => {
    const result = execSync('node', ['-e', "console.log('foo')"]);
    assert.equal(result.stdout, 'foo\n');
    assert.equal(result.stderr, '');
  });

  test('captures stderr', async () => {
    const result = execSync('node', ['-e', "console.error('some error')"]);
    assert.equal(result.stderr, 'some error\n');
    assert.equal(result.stdout, '');
  });

  test('non-zero exitCode throws when throwOnError=true', () => {
    assert.throws(
      () => {
        execSync('node', ['-e', 'process.exit(1);'], {throwOnError: true});
      },
      isBun
        ? {message: 'Process exited with non-zero status (1)'}
        : NonZeroExitError
    );
  });
});

describe(
  'execSync (windows)',
  {skip: isWindows ? false : 'Skipped on unix-like'},
  () => {
    test('does not throw spawn errors', async () => {
      const result = execSync('definitelyNonExistent');
      assert.equal(
        result.stderr,
        "'definitelyNonExistent' is not recognized as an internal" +
          ' or external command,\r\noperable program or batch file.\r\n'
      );
      assert.equal(result.stdout, '');
    });

    test('times out after defined timeout (ms)', () => {
      assert.throws(() => {
        execSync('ping', ['127.0.0.1', '-n', '2'], {timeout: 100});
      });
    });

    test('iterator receives errors as lines', () => {
      const proc = execSync('nonexistentforsure');
      const lines: string[] = [];
      for (const line of proc) {
        lines.push(line);
      }

      assert.deepEqual(lines, [
        "'nonexistentforsure' is not recognized as an internal or " +
          'external command,',
        'operable program or batch file.'
      ]);
    });
  }
);

describe(
  'exec (windows)',
  {skip: isWindows ? false : 'Skipped on unix-like'},
  () => {
    test('does not throw spawn errors', async () => {
      const result = await exec('definitelyNonExistent');
      assert.equal(
        result.stderr,
        "'definitelyNonExistent' is not recognized as an internal" +
          ' or external command,\r\noperable program or batch file.\r\n'
      );
      assert.equal(result.stdout, '');
    });

    test('times out after defined timeout (ms)', async () => {
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = exec('ping', ['127.0.0.1', '-n', '2'], {timeout: 100});
      await assert.rejects(async () => {
        await proc;
      });
      assert.equal(proc.killed, true);
      assert.equal(proc.process!.signalCode, 'SIGTERM');
    });

    test('throws spawn errors when throwOnError=true', async () => {
      const proc = exec('definitelyNonExistent', [], {throwOnError: true});
      try {
        await proc;
        assert.fail('Expected to throw');
      } catch (err) {
        assert.ok(err instanceof NonZeroExitError);
        assert.equal(
          (err as NonZeroExitError).output?.stderr,
          "'definitelyNonExistent' is not recognized as an internal" +
            ' or external command,\r\noperable program or batch file.\r\n'
        );
        assert.equal((err as NonZeroExitError).output?.stdout, '');
      }
    });

    test('kill terminates the process', async () => {
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = exec('ping', ['127.0.0.1', '-n', '2']);
      const result = proc.kill();
      assert.ok(result);
      assert.ok(proc.killed);
      assert.equal(proc.aborted, false);
    });

    test('pipe correctly pipes output', async () => {
      const echoProc = exec('node', ['-e', "console.log('foo')"]);
      const grepProc = echoProc.pipe('findstr', ['f']);
      const result = await grepProc;

      assert.equal(result.stderr, '');
      assert.equal(result.stdout, 'foo\n');
      assert.equal(result.exitCode, 0);
      assert.equal(echoProc.exitCode, 0);
      assert.equal(grepProc.exitCode, 0);
    });

    test('signal can be used to abort execution', async () => {
      const controller = new AbortController();
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = exec('ping', ['127.0.0.1', '-n', '2'], {
        signal: controller.signal
      });
      controller.abort();
      const result = await proc;
      assert.ok(proc.aborted);
      assert.ok(proc.killed);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, '');
    });

    test('iterator receives errors as lines', async () => {
      const proc = exec('nonexistentforsure');
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }

      assert.deepEqual(lines, [
        "'nonexistentforsure' is not recognized as an internal or " +
          'external command,',
        'operable program or batch file.'
      ]);
    });
  }
);

describe(
  'exec (unix-like)',
  {skip: isWindows ? 'Skipped on Windows' : false},
  () => {
    test('times out after defined timeout (ms)', async () => {
      const proc = exec('sleep', ['0.2'], {timeout: 100});
      await assert.rejects(async () => {
        await proc;
      }, /The operation was aborted/);
      assert.equal(proc.killed, true);
      assert.equal(proc.process!.signalCode, 'SIGTERM');
    });

    test('throws spawn errors', async () => {
      const proc = exec('definitelyNonExistent');
      await assert.rejects(
        async () => {
          await proc;
        },
        {
          message: isBun
            ? 'Executable not found in $PATH: "definitelyNonExistent"'
            : 'spawn definitelyNonExistent ENOENT'
        }
      );
    });

    test('kill terminates the process', async () => {
      const proc = exec('sleep', ['5']);
      const result = proc.kill();
      assert.ok(result);
      assert.ok(proc.killed);
      assert.equal(proc.aborted, false);
    });

    test('pipe correctly pipes output', async () => {
      const echoProc = exec('echo', ['foo\nbar']);
      const grepProc = echoProc.pipe('grep', ['foo']);
      const result = await grepProc;

      assert.equal(result.stderr, '');
      assert.equal(result.stdout, 'foo\n');
      assert.equal(result.exitCode, 0);
      assert.equal(echoProc.exitCode, 0);
      assert.equal(grepProc.exitCode, 0);
    });

    test('signal can be used to abort execution', async () => {
      const controller = new AbortController();
      const proc = exec('sleep', ['4'], {signal: controller.signal});
      controller.abort();
      const result = await proc;
      assert.ok(proc.aborted);
      assert.ok(proc.killed);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, '');
    });

    test('iterator receives errors', async () => {
      const proc = exec('nonexistentforsure');
      await assert.rejects(async () => {
        for await (const line of proc) {
          line;
        }
      });
    });
  }
);

describe(
  'execSync (unix-like)',
  {skip: isWindows ? 'Skipped on Windows' : false},
  () => {
    test('times out after defined timeout (ms)', () => {
      assert.throws(
        () => {
          execSync('sleep', ['0.2'], {timeout: 100});
        },
        {message: 'spawnSync sleep ETIMEDOUT'}
      );
    });

    test('throws spawn errors', () => {
      assert.throws(
        () => {
          execSync('definitelyNonExistent');
        },
        {
          message: isBun
            ? 'Executable not found in $PATH: "definitelyNonExistent"'
            : 'spawnSync definitelyNonExistent ENOENT'
        }
      );
    });

    test('iterator receives errors', () => {
      assert.throws(() => {
        execSync('nonexistentforsure');
      });
    });
  }
);
