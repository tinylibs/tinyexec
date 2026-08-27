import {spawn} from 'node:child_process';
import path from 'node:path';

// Spawn a grandchild which outlives us, so tests can check whether killing
// this process took the whole tree with it.
const grandchild = path.join(import.meta.dirname, 'grandchild.mjs');
const descendant = spawn(process.argv[0], [grandchild], {
  stdio: 'ignore'
});

if (descendant.pid === undefined) {
  throw new Error('Could not start descendant process');
}

process.stdout.write(String(descendant.pid));
setTimeout(() => {}, 30000);
