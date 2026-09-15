/**
 * dsh-plugin-structured-output — browser half.
 *
 * Registers the `structured-output` section in dsh Settings, where each agent
 * preset's visibility of StructuredOutput + /json-schema is toggled. The
 * persisted section lives in the host `structured-output` settings namespace.
 *
 * The section's reactive state crosses the slot contract through the reserved
 * inject `hooks` compartment (the renderer binds it to a
 * `useStructuredOutputSettings` selector hook); every read/write route — the
 * bound settings scope on loopback, the authenticated `/structured-output`
 * channel elsewhere — is decided here in `apply`, not in the component.
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
  StructuredOutputRpc,
  StructuredOutputScope,
  StructuredOutputSettingsInjected,
  StructuredOutputSettingsValue,
} from './StructuredOutputSettings.tsx'
import { en, zh } from './locales.ts'
import type { StructuredOutputLocaleKey } from './locales.ts'
// Local SlotMap declarations keep this package typechecking against pnpm's
// separately-resolved ui-settings copies (see slots.ts).
import type {} from './slots.ts'
import { SO_RPC_CHANNEL, SO_RPC_ENDPOINTS } from '../core/rpc.ts'

export { StructuredOutputSettings } from './StructuredOutputSettings.tsx'
export type {
  StructuredOutputPreset,
  StructuredOutputRpc,
  StructuredOutputScope,
  StructuredOutputSettingsInjected,
  StructuredOutputSettingsProps,
  StructuredOutputSettingsSnapshot,
  StructuredOutputSettingsHook,
  StructuredOutputSettingsValue,
} from './StructuredOutputSettings.tsx'

/** Cordis plugin name. */
export const name = 'structured-output-client'

/** Required services: slot registry + locale + settings + connection RPC + the preset remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.agentPresets', 'settingsScope', 'connection']

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
  const scope = ctx.settingsScope.bind<StructuredOutputSettingsValue>({ namespace: NS })
  const agentPresets = ctx.get('remote.agentPresets') as AgentPresetsRemote
  const connection = ctx.get('connection') as unknown as {
    rpc?: StructuredOutputRpc
  } | undefined
  const rpc = connection?.rpc

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

  // The authenticated fallback route: read the namespace through the channel
  // registered on the host half when the bound settings scope is memory-mode.
  const readRemoteSettings = async (): Promise<StructuredOutputSettingsValue | undefined> => {
    if (rpc === undefined) return undefined
    const result = await rpc.call(SO_RPC_CHANNEL, SO_RPC_ENDPOINTS.settingsGet, {})
    return result.ok && result.value !== undefined
      ? result.value as StructuredOutputSettingsValue
      : undefined
  }

  const setPresets = async (
    presets: Record<string, boolean>,
  ): Promise<StructuredOutputSettingsValue | undefined> => {
    if (scope.getSnapshot().status === 'ready') {
      await scope.set('presets', presets)
      return undefined
    }
    if (rpc === undefined) return undefined
    const result = await rpc.call(SO_RPC_CHANNEL, SO_RPC_ENDPOINTS.settingsSet, { presets })
    return result.ok && result.value !== undefined
      ? result.value as StructuredOutputSettingsValue
      : undefined
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'structured-output: settings dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'structured-output',
    order: 45,
    label: () => t('nav'),
    locale: NS,
    inject: (): StructuredOutputSettingsInjected => ({
      hooks: { structuredOutputSettings: scope as unknown as StructuredOutputScope },
      loadPresets,
      readRemoteSettings,
      setPresets,
    }),
  }, StructuredOutputSettings))
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'structured-output': StructuredOutputLocaleKey
  }
}
