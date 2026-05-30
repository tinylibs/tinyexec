import {spawn} from 'node:child_process';
import path from 'node:path';

// Spawn a grandchild that inherits our piped stdout fd (fd 1), simulating
// tsserver inheriting eslint's piped streams. The grandchild outlives us and
// holds the pipe open.
const grandchild = path.join(import.meta.dirname, 'grandchild.mjs');
spawn(process.argv[0], [grandchild], {stdio: ['ignore', 1, 'ignore']});

console.log('output');
process.exit(0);
