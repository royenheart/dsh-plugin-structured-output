import type { UserConfig } from 'tsdown'

/** Host-side externals resolved from the dsh profile node_modules at runtime. */
function hostExternal(id: string): boolean {
  return id.startsWith('@deepseek-ai/') || id.startsWith('@cordisjs/')
}

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
] satisfies UserConfig[]
