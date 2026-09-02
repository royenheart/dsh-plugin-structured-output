/**
 * RPC contract for the structured-output browser surface.
 *
 * The browser normally reads/writes the `structured-output` settings namespace
 * through `settingsScope`. On a non-loopback page that scope is memory-mode
 * (`status: 'unavailable'`), so the client falls back to this authenticated
 * logical channel, which the host plugin registers with
 * `ctx.connection.rpc.handle(SO_RPC_CHANNEL, handler)`.
 *
 * Authentication is inherited from `client-connection`: the physical route
 * runs every request through the same Host/Origin trust fence and dsh web
 * session cookie verification as the `/api` RPC. The plugin never registers a
 * bare `webServer` write route.
 *
 * This module is pure (no dsh imports) so parsing/validation is unit-testable.
 */

/** Single-segment logical channel name (required by `client-connection`). */
export const SO_RPC_CHANNEL = '/structured-output'

/** Endpoints owned by the channel. */
export const SO_RPC_ENDPOINTS = {
  settingsGet: 'settings/get',
  settingsSet: 'settings/set',
} as const

export type SoRpcEndpoint = (typeof SO_RPC_ENDPOINTS)[keyof typeof SO_RPC_ENDPOINTS]

/** Success/failure result shape mirrored from the dsh connection RPC result. */
export interface SoRpcSuccess {
  readonly ok: true
  readonly value: unknown
}

export interface SoRpcFailure {
  readonly ok: false
  readonly error: {
    readonly code: string
    readonly message: string
    readonly details: Record<string, never>
  }
}

export type SoRpcResult = SoRpcSuccess | SoRpcFailure

/** `settings/set` request. */
export interface SoSettingsSetRequest {
  readonly presets: Record<string, boolean>
}

/** Parse a `settings/set` payload. */
export function parseSoSettingsSetRequest(raw: unknown): SoSettingsSetRequest | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const presets = (raw as Record<string, unknown>).presets
  if (presets === null || typeof presets !== 'object' || Array.isArray(presets)) return undefined
  const out: Record<string, boolean> = {}
  for (const [presetId, value] of Object.entries(presets)) {
    if (typeof value !== 'boolean') return undefined
    out[presetId] = value
  }
  return { presets: out }
}
