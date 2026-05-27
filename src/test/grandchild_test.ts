import {describe, test, expect} from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const isWindows = os.platform() === 'win32';
const fixturesDir = path.join(import.meta.dirname, '../../test/fixtures');

// Tests run in a subprocess because the grandchild process spawned by the
// fixture script stays alive for 30s and would block vitest's teardown.
// Grandchildren are tagged with TINYEXEC_TEST_GRANDCHILD=1 for cleanup.
function killTestGrandchildren(): void {
  try {
    spawnSync('pkill', ['-f', 'tinyexec-test-grandchild']);
  } catch {}
}

describe.skipIf(isWindows)('exec (grandchild pipe inheritance)', () => {
  test('await completes when grandchild holds piped stdout open', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tinyexec-grandchild-')
    );
    const runnerScript = path.join(dir, 'runner.mjs');
    const distPath = JSON.stringify(
      path.join(process.cwd(), 'dist', 'main.mjs')
    );
    const fixturePath = JSON.stringify(
      path.join(fixturesDir, 'grandchild.mjs')
    );

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
      killTestGrandchildren();
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  test('async iterator completes when grandchild holds piped stdout open', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tinyexec-grandchild-')
    );
    const runnerScript = path.join(dir, 'runner.mjs');
    const distPath = JSON.stringify(
      path.join(process.cwd(), 'dist', 'main.mjs')
    );
    const fixturePath = JSON.stringify(
      path.join(fixturesDir, 'grandchild_multiline.mjs')
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
      killTestGrandchildren();
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
