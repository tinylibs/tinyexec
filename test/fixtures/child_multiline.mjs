import {spawn} from 'node:child_process';
import path from 'node:path';

const grandchild = path.join(import.meta.dirname, 'grandchild.mjs');
spawn(process.argv[0], [grandchild], {stdio: ['ignore', 1, 'ignore']});

console.log('line1');
console.log('line2');
process.exit(0);
