import {defineConfig} from 'tsdown';
import licenses from 'rollup-plugin-license';

export default defineConfig({
  entry: 'src/main.ts',
  target: 'es2022',
  clean: true,
  dts: true,
  plugins: [
    licenses({
      thirdParty: {
        output: {
          file: 'dist/LICENSES.txt',
          template(dependencies) {
            return dependencies.map((dependency) =>
              `${dependency.name}:${dependency.version} -- ${dependency.licenseText}`
            ).join('\n');
          }
        }
      }
    }) as never
  ],
  outputOptions: {
    minify: {
      mangle: true,
      compress: false,
      removeWhitespace: false
    }
  }
});
