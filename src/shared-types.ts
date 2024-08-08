import {type SpawnOptions} from 'node:child_process';

export interface ParsedShellOptions {
  command: string;
  args: string[];
  options: SpawnOptions;
}
