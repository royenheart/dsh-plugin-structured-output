import type { UserConfig } from 'tsdown'

const PACKAGE = '@royenheart/dsh-plugin-structured-output'

/** Host-side externals resolved from the dsh profile node_modules at runtime. */
function hostExternal(id: string): boolean {
  return id.startsWith('@deepseek-ai/') || id.startsWith('@cordisjs/')
}

/** Module-table externals the browser require answers. */
const BROWSER_EXTERNALS = [
  'react',
  'react/jsx-runtime',
]

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: true,
    clean: false,
    fixedExtension: false,
    deps: { neverBundle: hostExternal },
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    clean: false,
    deps: { neverBundle: BROWSER_EXTERNALS },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
