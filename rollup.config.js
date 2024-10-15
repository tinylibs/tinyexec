import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/main.ts',
  output: [
    {
      format: 'esm',
      file: 'dist/main.js'
    },
    {
      format: 'cjs',
      file: 'dist/main.cjs'
    },
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: 'tsconfig.json',
      declaration: true,
      declarationDir: 'dist'
    })
  ]
};
