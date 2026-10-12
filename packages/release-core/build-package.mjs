// Builds the publishable package into dist/: ESM and CommonJS bundles with
// dependencies left external, and a manifest carrying the published name.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(packageDir, '..', '..');
const outDir = join(packageDir, 'dist');
const source = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const shared = {
  entryPoints: [join(packageDir, 'src', 'index.ts')],
  bundle: true,
  packages: 'external',
  platform: 'neutral',
  target: 'es2022',
};
await build({ ...shared, format: 'esm', outfile: join(outDir, 'index.js') });
await build({ ...shared, format: 'cjs', outfile: join(outDir, 'index.cjs') });

const manifest = {
  name: '@steven3002/release-core',
  version: source.version,
  description: source.description,
  license: 'Apache-2.0',
  author: 'steven3002',
  repository: {
    type: 'git',
    url: 'git+https://github.com/steven3002/ReleaseGate.git',
    directory: 'packages/release-core',
  },
  homepage: 'https://github.com/steven3002/ReleaseGate#readme',
  type: 'module',
  main: './index.cjs',
  module: './index.js',
  types: './types/index.d.ts',
  exports: {
    '.': {
      types: './types/index.d.ts',
      import: './index.js',
      require: './index.cjs',
    },
  },
  sideEffects: false,
  engines: { node: '>=20' },
  dependencies: source.dependencies,
  publishConfig: { registry: 'https://npm.pkg.github.com' },
};
await writeFile(join(outDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

await cp(join(packageDir, 'README.md'), join(outDir, 'README.md'));
await cp(join(repoRoot, 'LICENSE'), join(outDir, 'LICENSE'));
await cp(join(repoRoot, 'NOTICE'), join(outDir, 'NOTICE'));
