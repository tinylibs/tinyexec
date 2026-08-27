import {type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {describe, expect, onTestFinished, test, vi} from 'vitest';
import {createKillFunction} from '../kill-descendants.js';
import {x, type Options, type Result} from '../main.js';

const isWindows = os.platform() === 'win32';
const fixture = path.join(
  import.meta.dirname,
  '../../test/fixtures/descendant.mjs'
);

interface DescendantProcess {
  subprocess: Result;
  subprocessPid: number;
  descendantPid: number;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number): Promise<void> {
  await vi.waitFor(
    () => {
      expect(isRunning(pid)).toBe(false);
    },
    {timeout: 10000, interval: 100}
  );
}

function forceKill(pid: number): void {
  if (!isRunning(pid)) {
    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // The process might have exited between the check and the signal.
  }
}

/**
 * Starts the fixture, which spawns a descendant and writes its PID to stdout.
 * Both processes are force killed once the calling test finishes, so a test
 * which fails half way through cannot leave them behind.
 */
async function spawnDescendant(
  options: Partial<Options> = {}
): Promise<DescendantProcess> {
  const subprocess = x('node', [fixture], options);
  const subprocessPid = subprocess.pid;
  const stdout = subprocess.process?.stdout;

  if (subprocessPid === undefined || stdout === null || stdout === undefined) {
    throw new Error('Could not start subprocess');
  }

  const [chunk] = await once(stdout, 'data');
  const descendantPid = Number.parseInt(String(chunk), 10);

  if (!Number.isInteger(descendantPid)) {
    throw new Error('Could not read descendant PID');
  }

  onTestFinished(() => {
    forceKill(subprocessPid);
    forceKill(descendantPid);
  });

  return {subprocess, subprocessPid, descendantPid};
}

describe('killDescendants', () => {
  test('terminates descendants when kill() is called', async () => {
    const {subprocess, subprocessPid, descendantPid} = await spawnDescendant({
      killDescendants: true
    });

    expect(isRunning(descendantPid)).toBe(true);
    expect(subprocess.kill()).toBe(true);
    await subprocess;

    expect(subprocess.killed).toBe(true);
    expect(isRunning(subprocessPid)).toBe(false);
    await waitForExit(descendantPid);
  });

  test('terminates descendants on timeout', async () => {
    const {subprocess, subprocessPid, descendantPid} = await spawnDescendant({
      killDescendants: true,
      timeout: 1000
    });

    expect(isRunning(descendantPid)).toBe(true);
    await expect(subprocess).rejects.toThrow();

    expect(subprocess.killed).toBe(true);
    expect(isRunning(subprocessPid)).toBe(false);
    await waitForExit(descendantPid);
  });

  test('terminates descendants on abort', async () => {
    const controller = new AbortController();
    const {subprocess, subprocessPid, descendantPid} = await spawnDescendant({
      killDescendants: true,
      signal: controller.signal
    });

    expect(isRunning(descendantPid)).toBe(true);
    controller.abort();
    await subprocess;

    expect(subprocess.aborted).toBe(true);
    expect(subprocess.killed).toBe(true);
    expect(isRunning(subprocessPid)).toBe(false);
    await waitForExit(descendantPid);
  });

  test('terminates descendants alongside persist', async () => {
    const {subprocess, subprocessPid, descendantPid} = await spawnDescendant({
      killDescendants: true,
      persist: true
    });

    expect(subprocess.kill()).toBe(true);
    await subprocess;

    expect(isRunning(subprocessPid)).toBe(false);
    await waitForExit(descendantPid);
  });

  // Windows can already take descendants down with the direct child, so
  // there is nothing to contrast the option against there.
  if (!isWindows) {
    test('leaves descendants running by default', async () => {
      const {subprocess, subprocessPid, descendantPid} =
        await spawnDescendant();

      expect(subprocess.kill()).toBe(true);
      await subprocess;

      expect(isRunning(subprocessPid)).toBe(false);
      expect(isRunning(descendantPid)).toBe(true);
    });

    test('leaves descendants running on timeout by default', async () => {
      const {subprocess, subprocessPid, descendantPid} = await spawnDescendant({
        timeout: 1000
      });

      await expect(subprocess).rejects.toThrow();

      expect(isRunning(subprocessPid)).toBe(false);
      expect(isRunning(descendantPid)).toBe(true);
    });

    test('signals the process group with an explicit signal', async () => {
      const {subprocess, subprocessPid, descendantPid} = await spawnDescendant({
        killDescendants: true
      });

      expect(subprocess.kill('SIGKILL')).toBe(true);
      await subprocess;

      expect(isRunning(subprocessPid)).toBe(false);
      await waitForExit(descendantPid);
    });
  }

  test('signal 0 does not terminate anything', async () => {
    const {subprocess, subprocessPid, descendantPid} = await spawnDescendant({
      killDescendants: true
    });

    expect(subprocess.kill(0)).toBe(true);
    await setTimeout(100);

    expect(isRunning(subprocessPid)).toBe(true);
    expect(isRunning(descendantPid)).toBe(true);
  });
});

if (isWindows) {
  describe('taskkill', () => {
    function createFakeSubprocess(): {
      subprocess: ChildProcess;
      directKill: ReturnType<typeof vi.fn>;
    } {
      const directKill = vi.fn(() => true);
      return {
        subprocess: {pid: 123, kill: directKill} as unknown as ChildProcess,
        directKill
      };
    }

    test('falls back to direct kill without a Windows directory', () => {
      const {subprocess, directKill} = createFakeSubprocess();

      expect(createKillFunction(subprocess, {})('SIGTERM')).toBe(true);
      expect(directKill).toHaveBeenCalledWith('SIGTERM');
    });

    test('falls back to direct kill for a relative Windows directory', () => {
      const {subprocess, directKill} = createFakeSubprocess();
      const kill = createKillFunction(subprocess, {SystemRoot: 'Windows'});

      expect(kill('SIGTERM')).toBe(true);
      expect(directKill).toHaveBeenCalledWith('SIGTERM');
    });

    test('falls back to direct kill for a UNC Windows directory', () => {
      const {subprocess, directKill} = createFakeSubprocess();
      const kill = createKillFunction(subprocess, {
        SystemRoot: '\\\\server\\share\\Windows'
      });

      expect(kill('SIGTERM')).toBe(true);
      expect(directKill).toHaveBeenCalledWith('SIGTERM');
    });

    test('falls back to direct kill when taskkill fails', async () => {
      const {subprocess, directKill} = createFakeSubprocess();
      const kill = createKillFunction(subprocess, {
        SystemRoot: 'C:\\MissingWindows'
      });

      expect(kill('SIGTERM')).toBe(true);
      await vi.waitFor(() => {
        expect(directKill).toHaveBeenCalledWith('SIGTERM');
      });
    });

    test('runs taskkill when the Windows directory resolves', async () => {
      const {subprocess, directKill} = createFakeSubprocess();
      const kill = createKillFunction(subprocess, process.env);

      expect(kill('SIGTERM')).toBe(true);
      // An unresolved directory falls back synchronously, so a direct kill
      // which only happens later proves taskkill was actually run.
      expect(directKill).not.toHaveBeenCalled();
      // PID 123 does not exist, so taskkill reports a failure.
      await vi.waitFor(() => {
        expect(directKill).toHaveBeenCalledWith('SIGTERM');
      });
    });
  });
}
