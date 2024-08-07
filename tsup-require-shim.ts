import {createRequire} from 'node:module';

if (!('require' in globalThis)) {
  globalThis.require = createRequire(import.meta.url);
}
