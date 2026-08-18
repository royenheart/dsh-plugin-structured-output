/**
 * dsh-plugin-structured-output — browser half.
 *
 * Registers the `structured-output` section in dsh Settings, where each agent
 * preset's visibility of StructuredOutput + /json-schema is toggled. The
 * persisted section lives in the host `structured-output` settings namespace.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: resolves the slots service merge + standard slot kit.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: resolves ctx.locale.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings.section SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
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

/** Required services: slot registry + locale + settings transport + settings scope. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/** Dictionary namespace owned by this settings section. */
const NS = 'structured-output'

export function apply(ctx: Context): void {
  const connection = ctx.get('connection') as ConnectionHandle
  // The locale runtime is provided by dsh-client-locale; read it through the
  // service registry so this package typechecks against both published and
  // workspace copies of the harness (the Context merge resolves differently).
  const locale = ctx.get('locale') as unknown as {
    register(ns: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): void
    bind(ns: string): (key: StructuredOutputLocaleKey, vars?: { name: string }) => string
  }
  const scope = ctx.settingsScope.bind<StructuredOutputSettingsValue>({ namespace: NS })

  const loadPresets = async (): Promise<readonly StructuredOutputPreset[]> => {
    const response = await connection.api.agentPresets.list({})
    if (!response.result.ok) {
      throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
    }
    return response.result.value.presets
  }

  ctx.effect(() => {
    locale.register(NS, { zh, en })
    return () => {}
  }, 'structured-output: settings dictionaries')
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
