import type {SpawnOptions} from 'child_process';

declare module 'cross-spawn' {
  export function _parse(
    file: string,
    args: readonly string[],
    options?: SpawnOptions
  ): {command: string; args: string[]; options: SpawnOptions};
}
