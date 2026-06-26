import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: 'src/main.ts',
  target: 'es2022',
  clean: true,
  dts: true,
});
