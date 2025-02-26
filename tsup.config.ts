import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["src/main.ts"],
  outDir: "dist",
  format: ["esm"],
  tsconfig: "./tsconfig.json",
  target: "es2022",
  minify: false,
  minifySyntax: true,
  minifyWhitespace: false,
  minifyIdentifiers: true,
  clean: true,
  dts: true,
  banner({ format }) {
    if (format === "esm") {
      return { js: `import { createRequire as __tinyexec_cr } from "node:module";const require = __tinyexec_cr(import.meta.url);` };
    }
  },
});

