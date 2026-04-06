let testModule: Awaited<typeof import('node:test')>;

if (process.versions.bun) {
  // @ts-expect-error wrong types
  testModule = await import('bun:test');
} else {
  // @ts-expect-error wrong types
  testModule = await import('node:test');
}

const {describe, test} = testModule;

export {describe, test};
