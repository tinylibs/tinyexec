import path from 'node:path';
import {exec} from '../../dist/main.mjs';

const childScript = path.join(import.meta.dirname, 'grandchild.mjs');

const lines = [];

for await (const line of exec('node', [childScript])) {
  lines.push(line);
}

process.stdout.write(JSON.stringify(lines));
