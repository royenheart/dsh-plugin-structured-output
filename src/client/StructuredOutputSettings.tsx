/**
 * StructuredOutputSettings — the global settings section controlling which
 * agent presets expose StructuredOutput and /json-schema.
 *
 * Reactive settings state arrives through the renderer-bound
 * `useStructuredOutputSettings` selector hook — the slot inject face's reserved
 * `hooks` compartment — and every write goes through the injected callbacks, so
 * this component carries no subscription machinery and no service object. The
 * host/remote write decision lives in `apply` (see `./index.ts`).
 */
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { StructuredOutputLocaleKey } from './locales.ts'

export interface StructuredOutputSettingsValue {
  presets: Record<string, boolean>
}

export interface StructuredOutputSettingsSnapshot {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value?: StructuredOutputSettingsValue
  readonly writable: boolean
}

/** Observable source the inject face hands to the renderer's hooks compartment.
 * Matches the dsh `HostObservable` pair (`getSnapshot` + `subscribe`). */
export interface StructuredOutputScope {
  getSnapshot(): StructuredOutputSettingsSnapshot
  subscribe(listener: () => void): () => void
}

/** Selector hook the renderer binds from `hooks.structuredOutputSettings`. */
export type StructuredOutputSettingsHook = <S>(
  select: (snapshot: StructuredOutputSettingsSnapshot) => S,
  equal?: (left: S, right: S) => boolean,
) => S

/** One row of the agentPreset.list response. */
export interface StructuredOutputPreset {
  readonly id: string
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

/** Inject face returned by `apply`; the renderer binds `hooks` to hooks props. */
export interface StructuredOutputSettingsInjected {
  readonly hooks: { readonly structuredOutputSettings: StructuredOutputScope }
  readonly loadPresets: () => Promise<readonly StructuredOutputPreset[]>
  readonly readRemoteSettings: () => Promise<StructuredOutputSettingsValue | undefined>
  readonly setPresets: (presets: Record<string, boolean>) => Promise<StructuredOutputSettingsValue | undefined>
}

/** Component-side view of the inject face (hooks compartment already bound). */
export type StructuredOutputSettingsProps = Partial<{
  useStructuredOutputSettings: StructuredOutputSettingsHook
  loadPresets: () => Promise<readonly StructuredOutputPreset[]>
  readRemoteSettings: () => Promise<StructuredOutputSettingsValue | undefined>
  setPresets: (presets: Record<string, boolean>) => Promise<StructuredOutputSettingsValue | undefined>
}> & {
  readonly close?: () => void
  readonly t?: (key: StructuredOutputLocaleKey, vars?: { name: string }) => string
}

/** Minimal face of the authenticated connection channel used by the client half. */
export interface StructuredOutputRpc {
  call(channel: string, endpoint: string, payload: unknown): Promise<{
    readonly ok: boolean
    readonly value?: unknown
    readonly error?: { readonly message?: string }
  }>
}

const STYLE: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--dsw-alias-label-primary, #333)' },
  hint: { color: 'var(--dsw-alias-label-secondary, #616161)', fontSize: 12, lineHeight: 1.6 },
  status: { color: 'var(--dsw-alias-label-secondary, #616161)', fontSize: 12 },
  error: { color: '#c62828', fontSize: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid var(--dsw-alias-border, #e0e0e0)',
    borderRadius: 8,
    background: 'var(--dsw-surface, #fafafa)',
  },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  rowName: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 },
  badge: {
    padding: '1px 6px',
    borderRadius: 999,
    background: 'var(--dsw-alias-interactive-bg-hover, #f0f0f0)',
    color: 'var(--dsw-alias-label-caption, #81858c)',
    fontSize: 10,
    fontWeight: 500,
  },
  rowDesc: { color: 'var(--dsw-alias-label-secondary, #616161)', fontSize: 11, lineHeight: 1.4 },
  toggle: { flex: 'none', width: 16, height: 16, cursor: 'pointer' },
}

const UNAVAILABLE_SNAPSHOT: StructuredOutputSettingsSnapshot = Object.freeze({
  status: 'unavailable',
  writable: false,
})

/**
 * Stand-in for a directly mounted component with no renderer-bound hook.
 * @param select - projection over the absent settings snapshot.
 * @returns the projection's value for the unavailable snapshot.
 */
function useAbsentSettings<S>(select: (snapshot: StructuredOutputSettingsSnapshot) => S): S {
  return select(UNAVAILABLE_SNAPSHOT)
}

function translate(
  t: StructuredOutputSettingsProps['t'],
  key: StructuredOutputLocaleKey,
  vars?: { name: string },
): string {
  return t?.(key, vars) ?? key
}

/** A remote read triggered by the first render whose bound scope is unavailable. */
type RemoteReadStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** Render one settings section listing per-preset visibility toggles. */
export function StructuredOutputSettings({
  useStructuredOutputSettings, loadPresets, readRemoteSettings, setPresets, close, t,
}: StructuredOutputSettingsProps): ReactElement | null {
  void close

  // The renderer binds this hook for every mounted contribution; the fallback
  // keeps a directly mounted component (tests) renderable without one.
  const useSettings = useStructuredOutputSettings ?? useAbsentSettings
  const snapshot = useSettings(settings => settings)

  const [remoteValue, setRemoteValue] = useState<StructuredOutputSettingsValue | undefined>(undefined)
  const [remoteStatus, setRemoteStatus] = useState<RemoteReadStatus>('idle')

  useEffect(() => {
    // On loopback the bound settings scope is authoritative. In a non-loopback
    // browser it reports 'unavailable', so the injected read becomes the
    // effective settings snapshot.
    if (readRemoteSettings === undefined || snapshot.status !== 'unavailable') return
    let stale = false
    setRemoteStatus('loading')
    readRemoteSettings()
      .then((value) => {
        if (stale) return
        if (value === undefined) {
          setRemoteStatus('failed')
          return
        }
        setRemoteValue(value)
        setRemoteStatus('ready')
      })
      .catch(() => {
        if (!stale) setRemoteStatus('failed')
      })
    return () => { stale = true }
  }, [readRemoteSettings, snapshot.status])

  const [presets, setPresetList] = useState<readonly StructuredOutputPreset[]>([])
  const [presetState, setPresetState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (loadPresets === undefined) return
    let stale = false
    setPresetState('loading')
    Promise.resolve()
      .then(() => loadPresets())
      .then((entries) => {
        if (stale) return
        setPresetList(entries)
        setPresetState('ready')
      })
      .catch(() => {
        if (!stale) setPresetState('error')
      })
    return () => { stale = true }
  }, [loadPresets])

  const settingsSnapshot = useMemo<StructuredOutputSettingsSnapshot>(() => {
    if (snapshot.status === 'ready') return snapshot
    if (snapshot.status === 'unavailable' && remoteStatus === 'ready' && remoteValue !== undefined) {
      return { status: 'ready', value: remoteValue, writable: true }
    }
    if (snapshot.status === 'unavailable' && remoteStatus === 'loading') {
      return { status: 'loading', writable: false }
    }
    return snapshot
  }, [snapshot, remoteStatus, remoteValue])

  const enabled = useMemo(() => settingsSnapshot.value?.presets ?? {}, [settingsSnapshot.value])

  if (loadPresets === undefined) return null

  const setVisible = (presetId: string, visible: boolean): void => {
    if (setPresets === undefined) return
    const next = { ...enabled, [presetId]: visible }
    void Promise.resolve(setPresets(next))
      .then((value) => {
        // A host-scope write republishes through the bound hook; only the
        // remote route answers with the accepted value.
        if (value === undefined) return
        setRemoteValue(value)
        setRemoteStatus('ready')
      })
      .catch(() => {})
  }

  return (
    <div style={STYLE.root}>
      <div style={STYLE.hint}>{translate(t, 'intro')}</div>
      {settingsSnapshot.status === 'loading' && <div style={STYLE.status}>{translate(t, 'loading')}</div>}
      {settingsSnapshot.status === 'unavailable' && <div style={STYLE.error}>{translate(t, 'unavailable')}</div>}
      {presetState === 'loading' && <div style={STYLE.status}>{translate(t, 'presetsLoading')}</div>}
      {presetState === 'error' && <div style={STYLE.error}>{translate(t, 'presetsError')}</div>}
      {presetState === 'ready' && (
        <div style={STYLE.list}>
          {presets.map(preset => (
            <div key={preset.id} style={STYLE.row}>
              <div style={STYLE.rowText}>
                <div style={STYLE.rowName}>
                  <span>{preset.name ?? preset.id}</span>
                  {preset.isDefault && <span style={STYLE.badge}>{translate(t, 'defaultPreset')}</span>}
                  {preset.broken !== undefined && <span style={STYLE.badge}>{translate(t, 'brokenPreset')}</span>}
                </div>
                {preset.description !== undefined && <div style={STYLE.rowDesc}>{preset.description}</div>}
              </div>
              <input
                type="checkbox"
                style={STYLE.toggle}
                aria-label={translate(t, 'enable', { name: preset.name ?? preset.id })}
                disabled={preset.broken !== undefined || settingsSnapshot.status !== 'ready'}
                checked={enabled[preset.id] === true}
                onChange={(event) => { setVisible(preset.id, event.currentTarget.checked) }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default StructuredOutputSettings
