import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: 'src/main.ts',
  target: 'es2022',
  clean: true,
  dts: true,
  outputOptions: {
    minify: {
      mangle: true,
      compress: false,
      removeWhitespace: false
    }
  }
});
