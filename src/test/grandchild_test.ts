import {describe, test, expect} from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const isWindows = os.platform() === 'win32';

function runInSubprocess(
  childScript: string,
  runnerBody: string
): {status: number | null; signal: string | null; stdout: string} {
  const dir = path.dirname(childScript);
  const runnerScript = path.join(dir, 'runner.mjs');
  const distPath = JSON.stringify(
    path.join(process.cwd(), 'dist', 'main.mjs')
  );
  const childPath = JSON.stringify(childScript);

  fs.writeFileSync(
    runnerScript,
    `import { x } from ${distPath}\n${runnerBody.replace(/CHILD_SCRIPT/g, childPath)}`
  );

  try {
    const proc = spawnSync('node', [runnerScript], {
      timeout: 10000,
      encoding: 'utf8',
      killSignal: 'SIGKILL'
    });

    return {
      status: proc.status,
      signal: proc.signal,
      stdout: proc.stdout ?? ''
    };
  } finally {
    try {
      spawnSync('pkill', ['-f', dir]);
    } catch {}
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe.skipIf(isWindows)('exec (grandchild pipe inheritance)', () => {
  test('await completes when grandchild holds piped stdout open', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tinyexec-grandchild-')
    );
    const childScript = path.join(dir, 'child.mjs');

    fs.writeFileSync(
      childScript,
      `import { spawn } from 'node:child_process'
console.log('output')
spawn('node', ['-e', 'setTimeout(() => void 0, 30000)'], {
  stdio: ['ignore', 1, 'ignore'],
})
process.exit(0)
`
    );

    const result = runInSubprocess(
      childScript,
      `
const result = await Promise.race([
  x('node', [CHILD_SCRIPT]).then(() => 'completed'),
  new Promise((resolve) => setTimeout(() => resolve('hung'), 5000)),
])
process.stdout.write(result)
process.exit(result === 'completed' ? 0 : 1)
`
    );

    if (result.signal === 'SIGKILL') {
      expect.unreachable(
        'exec hung for 10s (grandchild held pipe open)'
      );
    }

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('completed');
  });

  test('async iterator completes when grandchild holds piped stdout open', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tinyexec-grandchild-')
    );
    const childScript = path.join(dir, 'child.mjs');

    fs.writeFileSync(
      childScript,
      `import { spawn } from 'node:child_process'
console.log('line1')
console.log('line2')
spawn('node', ['-e', 'setTimeout(() => void 0, 30000)'], {
  stdio: ['ignore', 1, 'ignore'],
})
process.exit(0)
`
    );

    const result = runInSubprocess(
      childScript,
      `
const lines = []
const result = await Promise.race([
  (async () => {
    for await (const line of x('node', [CHILD_SCRIPT])) {
      lines.push(line)
    }
    return 'completed'
  })(),
  new Promise((resolve) => setTimeout(() => resolve('hung'), 5000)),
])
process.stdout.write(JSON.stringify({ result, lines }))
process.exit(result === 'completed' ? 0 : 1)
`
    );

    if (result.signal === 'SIGKILL') {
      expect.unreachable(
        'async iterator hung for 10s (grandchild held pipe open)'
      );
    }

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.result).toBe('completed');
    expect(parsed.lines).toEqual(['line1', 'line2']);
  });
});
