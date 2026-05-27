import {spawn} from 'node:child_process';

spawn(
  process.argv[0],
  ['-e', 'setTimeout(() => void 0, 3000)'],
  {stdio: ['ignore', 1, 'ignore']}
);

console.log('line1');
console.log('line2');
process.exit(0);
