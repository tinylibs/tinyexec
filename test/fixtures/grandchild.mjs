import {spawn} from 'node:child_process';

// Spawn a grandchild that inherits the piped stdout fd, simulating
// tsserver inheriting eslint's piped streams. Short timeout to avoid
// blocking test teardown.
spawn(
  process.argv[0],
  ['-e', 'setTimeout(() => void 0, 3000)'],
  {stdio: ['ignore', 1, 'ignore']}
);

console.log('output');
process.exit(0);
