import {x, xSync, ExecProcess, NonZeroExitError} from '../main.js';
import {describe, test, expect} from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const isWindows = os.platform() === 'win32';
const fixturesDir = path.join(import.meta.dirname, '../../test/fixtures');
const distDir = path.join(import.meta.dirname, '../../dist');

const variants = [
  {name: 'async', x, isAsync: true},
  {name: 'sync', x: xSync, isAsync: false}
];

describe.each(variants)('exec ($name)', ({x, isAsync}) => {
  test('pid is number', async () => {
    const proc = x('echo', ['foo']);
    await proc;
    expect(typeof proc.pid === 'number').ok;
  });

  test('exitCode is set correctly', async () => {
    const proc = x('echo', ['foo']);

    // only async API will have its exitCode undefined before awaiting;
    // for sync API the process has already exited by the time we reach here
    if (isAsync) {
      expect(proc.exitCode).toBe(undefined);
    }

    const result = await proc;
    expect(proc.exitCode).toBe(0);
    expect(result.exitCode).toBe(0);
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

describe('exec (async)', () => {
  test('non-zero exitCode throws when throwOnError=true', async () => {
    const proc = x('node', ['-e', 'process.exit(1);'], {throwOnError: true});
    await expect(async () => {
      await proc;
    }).rejects.toThrow(NonZeroExitError);
    expect(proc.exitCode).toBe(1);
  });

  test('async iterator throws when throwOnError=true and exit non-zero', async () => {
    const proc = x('node', ['-e', "console.log('foo'); process.exit(1);"], {
      throwOnError: true
    });
    const lines: string[] = [];
    await expect(async () => {
      for await (const line of proc) {
        lines.push(line);
      }
    }).rejects.toThrow(NonZeroExitError);
    expect(lines).toEqual(['foo']);
    expect(proc.exitCode).toBe(1);
  });

  test('supports stdin passed as a string', async () => {
    let result = await x('node', ['-e', 'process.stdin.pipe(process.stdout)'], {
      stdin: 'foo\nbar'
    });

    expect(result.stdout).toBe('foo\nbar');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);

    // Ensuring that empty string doesn’t cause issues
    result = await x(
      'node',
      ['-e', "process.stdout.write(String(fs.readFileSync(0,'utf8').length))"],
      {stdin: ''}
    );

    expect(result.stdout).toBe('0');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  test('supports stdin passed as another process (Result)', async () => {
    const proc = x('node', ['-e', "process.stdout.write('foo\\nbar')"]);
    const result = await x(
      'node',
      ['-e', 'process.stdin.pipe(process.stdout)'],
      {stdin: proc}
    );

    expect(result.stdout).toBe('foo\nbar');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  test('supports stdin passed as another process (ExecProcess)', async () => {
    const proc = new ExecProcess('node', [
      '-e',
      "process.stdout.write('foo\\nbar')"
    ]);
    proc.spawn();

    const result = await x(
      'node',
      ['-e', 'process.stdin.pipe(process.stdout)'],
      {stdin: proc}
    );

    expect(result.stdout).toBe('foo\nbar');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });
});

describe('exec (sync)', () => {
  test('non-zero exitCode throws when throwOnError=true', () => {
    expect(() => {
      xSync('node', ['-e', 'process.exit(1);'], {throwOnError: true});
    }).toThrow(NonZeroExitError);
  });
});

if (isWindows) {
  describe.each(variants)('exec (windows) ($name)', ({x}) => {
    test('does not throw spawn errors', async () => {
      const result = await x('definitelyNonExistent');
      expect(result.stderr).toBe(
        "'definitelyNonExistent' is not recognized as an internal" +
          ' or external command,\r\noperable program or batch file.\r\n'
      );
      expect(result.stdout).toBe('');
    });
  });

  describe('exec (windows) (async)', () => {
    test('times out after defined timeout (ms)', async () => {
      // Somewhat filthy way of waiting for 2 seconds across cmd/ps
      const proc = x('ping', ['127.0.0.1', '-n', '2'], {timeout: 100});
      await expect(async () => {
        await proc;
      }).rejects.toThrow();
      expect(proc.killed).toBe(true);
      expect(proc.process!.signalCode).toBe('SIGTERM');
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

    test('iterator receives errors as lines', async () => {
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

    test('preserves leading ./ so cwd-local binary is run, not PATH lookup', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyexec-relpath-'));
      try {
        const scriptPath = path.join(dir, 'mytool.cmd');
        fs.writeFileSync(scriptPath, '@echo local\r\n');

        const result = await x('./mytool.cmd', [], {
          nodeOptions: {cwd: dir}
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('local\r\n');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });
  });

  describe('exec (windows) (sync)', () => {
    test('times out after defined timeout (ms)', () => {
      expect(() => {
        xSync('ping', ['127.0.0.1', '-n', '2'], {timeout: 100});
      }).toThrow();
    });

    test('iterator receives errors as lines', () => {
      const proc = xSync('nonexistentforsure');
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

    test('preserves leading ./ so cwd-local binary is run, not PATH lookup', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyexec-relpath-'));
      try {
        const scriptPath = path.join(dir, 'mytool.cmd');
        fs.writeFileSync(scriptPath, '@echo local\r\n');

        const result = xSync('./mytool.cmd', [], {
          nodeOptions: {cwd: dir}
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('local\r\n');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });
  });
}

if (!isWindows) {
  describe('exec (unix-like) (async)', () => {
    test('times out after defined timeout (ms)', async () => {
      const proc = x('sleep', ['0.2'], {timeout: 100});
      await expect(async () => {
        await proc;
      }).rejects.toThrow('The operation was aborted');
      expect(proc.killed).toBe(true);
      expect(proc.process!.signalCode).toBe('SIGTERM');
    });

    test('throws spawn errors', async () => {
      const proc = x('definitelyNonExistent');
      await expect(async () => {
        await proc;
      }).rejects.toThrow(
        process.versions.bun
          ? 'Executable not found in $PATH: "definitelyNonExistent"'
          : 'spawn definitelyNonExistent ENOENT'
      );
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

    test('iterator receives errors', async () => {
      const proc = x('nonexistentforsure');
      await expect(async () => {
        for await (const line of proc) {
          line;
        }
      }).rejects.toThrow();
    });

    test('preserves leading ./ so cwd-local binary is run, not PATH lookup', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyexec-relpath-'));
      try {
        const scriptPath = path.join(dir, 'mytool');
        fs.writeFileSync(scriptPath, '#!/bin/sh\necho local\n');
        fs.chmodSync(scriptPath, 0o755);

        const result = await x('./mytool', [], {
          nodeOptions: {cwd: dir, env: {PATH: '/usr/bin:/bin'}}
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('local\n');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

    test.skip('resolves when grandchild holds piped stdout open', async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'tinyexec-grandchild-')
      );
      const runnerScript = path.join(dir, 'runner.mjs');
      const distPath = JSON.stringify(path.join(distDir, 'main.mjs'));
      const fixturePath = JSON.stringify(path.join(fixturesDir, 'child.mjs'));

      fs.writeFileSync(
        runnerScript,
        `import { x } from ${distPath}
  const result = await x('node', [${fixturePath}])
  process.stdout.write(JSON.stringify({ stdout: result.stdout, exitCode: result.exitCode }))
  `
      );

      try {
        const proc = spawnSync('node', [runnerScript], {
          timeout: 10000,
          encoding: 'utf8',
          killSignal: 'SIGKILL',
          stdio: ['pipe', 'pipe', 'pipe']
        });

        expect(proc.signal).not.toBe('SIGKILL');
        expect(proc.status).toBe(0);
        const parsed = JSON.parse(proc.stdout.trim());
        expect(parsed.exitCode).toBe(0);
        expect(parsed.stdout).toBe('output\n');
      } finally {
        spawnSync('pkill', ['-f', 'grandchild.mjs']);
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

    test.skip('iterator completes when grandchild holds piped stdout open', async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'tinyexec-grandchild-')
      );
      const runnerScript = path.join(dir, 'runner.mjs');
      const distPath = JSON.stringify(path.join(distDir, 'main.mjs'));
      const fixturePath = JSON.stringify(
        path.join(fixturesDir, 'child_multiline.mjs')
      );

      fs.writeFileSync(
        runnerScript,
        `import { x } from ${distPath}
  const lines = []
  for await (const line of x('node', [${fixturePath}])) {
    lines.push(line)
  }
  process.stdout.write(JSON.stringify(lines))
  `
      );

      try {
        const proc = spawnSync('node', [runnerScript], {
          timeout: 10000,
          encoding: 'utf8',
          killSignal: 'SIGKILL',
          stdio: ['pipe', 'pipe', 'pipe']
        });

        expect(proc.signal).not.toBe('SIGKILL');
        expect(proc.status).toBe(0);
        const parsed = JSON.parse(proc.stdout.trim());
        expect(parsed).toEqual(['line1', 'line2']);
      } finally {
        spawnSync('pkill', ['-f', 'grandchild.mjs']);
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });
  });

  describe('exec (unix-like) (sync)', () => {
    test('times out after defined timeout (ms)', () => {
      expect(() => {
        xSync('sleep', ['0.2'], {timeout: 100});
      }).toThrow('spawnSync sleep ETIMEDOUT');
    });

    test('throws spawn errors', () => {
      expect(() => {
        xSync('definitelyNonExistent');
      }).toThrow(
        process.versions.bun
          ? 'Executable not found in $PATH: "definitelyNonExistent"'
          : 'spawnSync definitelyNonExistent ENOENT'
      );
    });

    test('iterator receives errors', () => {
      expect(() => {
        xSync('nonexistentforsure');
      }).toThrow();
    });

    test('preserves leading ./ so cwd-local binary is run, not PATH lookup', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyexec-relpath-'));
      try {
        const scriptPath = path.join(dir, 'mytool');
        fs.writeFileSync(scriptPath, '#!/bin/sh\necho local\n');
        fs.chmodSync(scriptPath, 0o755);

        const result = xSync('./mytool', [], {
          nodeOptions: {cwd: dir, env: {PATH: '/usr/bin:/bin'}}
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('local\n');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });
  });
}
