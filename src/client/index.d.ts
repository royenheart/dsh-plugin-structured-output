/**
 * Hand-maintained public types for the browser half (tsdown's CJS client
 * bundle does not emit d.ts). Keep in sync with src/client/index.ts exports.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  StructuredOutputPreset,
  StructuredOutputRpc,
  StructuredOutputScope,
  StructuredOutputSettingsInjected,
  StructuredOutputSettingsProps,
  StructuredOutputSettingsValue,
} from './StructuredOutputSettings.tsx'

export declare const name: 'structured-output-client'
export declare const inject: ['slots', 'locale', 'remote', 'remote.agentPresets', 'settingsScope', 'connection']
export declare function apply(ctx: Context): void
export { StructuredOutputSettings } from './StructuredOutputSettings.tsx'
export type {
  StructuredOutputPreset,
  StructuredOutputRpc,
  StructuredOutputScope,
  StructuredOutputSettingsInjected,
  StructuredOutputSettingsProps,
  StructuredOutputSettingsValue,
}
