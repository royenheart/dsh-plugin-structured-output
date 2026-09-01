/**
 * dsh-plugin-structured-output — browser half.
 *
 * Registers the `structured-output` section in dsh Settings, where each agent
 * preset's visibility of StructuredOutput + /json-schema is toggled. The
 * persisted section lives in the host `structured-output` settings namespace.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: resolves the ctx.slots registry installed by the UI renderer.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: resolves the ctx.remote merge and mounted remote namespaces.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: resolves ctx.locale.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings.section SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import { StructuredOutputSettings } from './StructuredOutputSettings.tsx'
import type {
  StructuredOutputPreset,
  StructuredOutputScope,
  StructuredOutputSettingsInjected,
  StructuredOutputSettingsProps,
  StructuredOutputSettingsValue,
} from './StructuredOutputSettings.tsx'
import { en, zh } from './locales.ts'
import type { StructuredOutputLocaleKey } from './locales.ts'
// Local SlotMap declarations keep this package typechecking against pnpm's
// separately-resolved ui-settings copies (see slots.ts).
import type {} from './slots.ts'

export { StructuredOutputSettings } from './StructuredOutputSettings.tsx'
export type {
  StructuredOutputPreset,
  StructuredOutputScope,
  StructuredOutputSettingsInjected,
  StructuredOutputSettingsProps,
  StructuredOutputSettingsValue,
} from './StructuredOutputSettings.tsx'

/** Cordis plugin name. */
export const name = 'structured-output-client'

/** Required services: slot registry + locale + settings + the 0.1.2 preset remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.agentPresets', 'settingsScope']

/** Dictionary namespace owned by this settings section. */
const NS = 'structured-output'

/** RemoteResult face used by `ctx.remote.agentPresets` (no `.result` wrapper). */
type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

type AgentPresetsRemote = {
  list(): Promise<RemoteResult<{ presets: readonly StructuredOutputPreset[] }>>
}

export function apply(ctx: Context): void {
  // The locale runtime is provided by dsh-client-locale; read it through the
  // service registry so this package typechecks against both published and
  // workspace copies of the harness (the Context merge resolves differently).
  const locale = ctx.get('locale') as unknown as {
    register(ns: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
    bind(ns: string): (key: StructuredOutputLocaleKey, vars?: { name: string }) => string
  }
  const scope = ctx.settingsScope.bind<StructuredOutputSettingsValue>({ namespace: NS })
  const agentPresets = ctx.get('remote.agentPresets') as AgentPresetsRemote

  const loadPresets = async (): Promise<readonly StructuredOutputPreset[]> => {
    const response = await agentPresets.list()
    if (!response.ok) {
      // Same empty-roster fallback first-party ui-agent-preset uses when the
      // Host composition has no agent-presets service.
      if (response.error.code === 'gateway/invocation-unavailable') return []
      throw new Error(`${response.error.code}: ${response.error.message}`)
    }
    return response.value.presets
  }

  ctx.effect(() => locale.register(NS, { zh, en }), 'structured-output: settings dictionaries')
  const t = locale.bind(NS)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'structured-output',
    order: 45,
    label: () => t('nav'),
    locale: NS,
    inject: (): StructuredOutputSettingsInjected => ({
      scope: scope as unknown as StructuredOutputScope,
      loadPresets,
    }),
  }, StructuredOutputSettings as unknown as (props: StructuredOutputSettingsProps) => ReturnType<typeof StructuredOutputSettings>))
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'structured-output': StructuredOutputLocaleKey
  }
}
