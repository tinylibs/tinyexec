import {x} from '../main.js';
import {describe, test, expect} from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const isWindows = os.platform() === 'win32';

describe.skipIf(isWindows)('exec (grandchild pipe inheritance)', () => {
  test('await completes when grandchild holds piped stdout open', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyexec-grandchild-'));
    const childScript = path.join(dir, 'child.mjs');

    fs.writeFileSync(
      childScript,
      `import { spawn } from 'node:child_process'
spawn('node', ['-e', 'setTimeout(() => void 0, 30000)'], {
  stdio: ['ignore', 1, 'ignore'],
})
process.stdout.write('output\\n')
process.exit(0)
`
    );

    // Run in a subprocess so the orphaned grandchild doesn't block vitest.
    // The runner uses the built dist/main.mjs directly.
    const runnerScript = path.join(dir, 'runner.mjs');
    const distPath = path.join(process.cwd(), 'dist', 'main.mjs');
    fs.writeFileSync(
      runnerScript,
      `import { x } from '${distPath}'

const result = await Promise.race([
  x('node', ['${childScript}']).then(() => 'completed'),
  new Promise((resolve) => setTimeout(() => resolve('hung'), 5000)),
])

try { process.kill(-process.pid) } catch {}
process.stdout.write(result)
process.exit(result === 'completed' ? 0 : 1)
`
    );

    try {
      const proc = spawnSync('node', [runnerScript], {
        timeout: 10000,
        encoding: 'utf8',
        killSignal: 'SIGKILL',
      });

      if (proc.signal === 'SIGKILL') {
        expect.unreachable(
          'exec hung for 10s (grandchild held pipe open)'
        );
      }

      expect(proc.status).toBe(0);
      expect(proc.stdout.trim()).toBe('completed');
    } finally {
      try {
        spawnSync('pkill', ['-f', dir]);
      } catch {}
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  test('async iterator completes when grandchild holds piped stdout open', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyexec-grandchild-'));
    const childScript = path.join(dir, 'child.mjs');

    fs.writeFileSync(
      childScript,
      `import { spawn } from 'node:child_process'
spawn('node', ['-e', 'setTimeout(() => void 0, 30000)'], {
  stdio: ['ignore', 1, 'ignore'],
})
process.stdout.write('line1\\nline2\\n')
process.exit(0)
`
    );

    const runnerScript = path.join(dir, 'runner.mjs');
    const distPath = path.join(process.cwd(), 'dist', 'main.mjs');
    fs.writeFileSync(
      runnerScript,
      `import { x } from '${distPath}'

const lines = []
const result = await Promise.race([
  (async () => {
    for await (const line of x('node', ['${childScript}'])) {
      lines.push(line)
    }
    return 'completed'
  })(),
  new Promise((resolve) => setTimeout(() => resolve('hung'), 5000)),
])

try { process.kill(-process.pid) } catch {}
process.stdout.write(JSON.stringify({ result, lines }))
process.exit(result === 'completed' ? 0 : 1)
`
    );

    try {
      const proc = spawnSync('node', [runnerScript], {
        timeout: 10000,
        encoding: 'utf8',
        killSignal: 'SIGKILL',
      });

      if (proc.signal === 'SIGKILL') {
        expect.unreachable(
          'async iterator hung for 10s (grandchild held pipe open)'
        );
      }

      expect(proc.status).toBe(0);
      const parsed = JSON.parse(proc.stdout.trim());
      expect(parsed.result).toBe('completed');
      expect(parsed.lines).toEqual(['line1', 'line2']);
    } finally {
      try {
        spawnSync('pkill', ['-f', dir]);
      } catch {}
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
