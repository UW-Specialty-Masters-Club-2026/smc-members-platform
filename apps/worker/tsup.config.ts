import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Bundle only internal workspace packages (they ship TypeScript source). Every
  // third-party package stays external: several are CommonJS and the Prisma client
  // loads files at runtime, neither of which survives being inlined into ESM.
  noExternal: [/^@smc\//],
  external: [/^(?!@smc\/)(@[^/]+\/)?[^./][^/]*/],
});
