import path from 'node:path';
import {exec} from '../../dist/main.mjs';

const childScript = path.join(import.meta.dirname, 'grandchild.mjs');

const result = await exec('node', [childScript]);

process.stdout.write(
  JSON.stringify({stdout: result.stdout, exitCode: result.exitCode})
);
