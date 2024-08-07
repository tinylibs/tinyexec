import { defineConfig, type Options } from "tsup";

const defaultConfig: Options = {
  entryPoints: ["src/main.ts"],
  outDir: "dist",
  tsconfig: "./tsconfig.json",
  target: "es2022",
  minify: false,
  minifySyntax: true,
  minifyWhitespace: false,
  minifyIdentifiers: true,
  clean: true,
  dts: true,
};

export default defineConfig([
  {
    ...defaultConfig,
    format: ["esm"],
    inject: ['tsup-require-shim.ts']
  },
  {
    ...defaultConfig,
    format: ["cjs"]
  }
]);
