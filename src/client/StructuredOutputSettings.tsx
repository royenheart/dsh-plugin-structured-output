/**
 * StructuredOutputSettings — the global settings section controlling which
 * agent presets expose StructuredOutput and /json-schema.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
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

/** Minimal face of the bound settings scope (the ui-settings package owns the concrete type).
 * Matches the current dsh `SettingsScope<T>` contract: the scope self-loads
 * when bound, so there is no `load()` method to call. */
export interface StructuredOutputScope {
  getSnapshot(): StructuredOutputSettingsSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

/** One row of the agentPreset.list response. */
export interface StructuredOutputPreset {
  readonly id: string
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

export interface StructuredOutputSettingsInjected {
  readonly scope: StructuredOutputScope
  readonly loadPresets: () => Promise<readonly StructuredOutputPreset[]>
}

export type StructuredOutputSettingsProps = Partial<StructuredOutputSettingsInjected> & {
  readonly close?: () => void
  readonly t?: (key: StructuredOutputLocaleKey, vars?: { name: string }) => string
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

function translate(
  t: StructuredOutputSettingsProps['t'],
  key: StructuredOutputLocaleKey,
  vars?: { name: string },
): string {
  return t?.(key, vars) ?? key
}

/** Render one settings section listing per-preset visibility toggles. */
export function StructuredOutputSettings({
  scope, loadPresets, close, t,
}: StructuredOutputSettingsProps): ReactElement | null {
  void close

  const snapshot = useSyncExternalStore(
    (listener: () => void) => scope?.subscribe(listener) ?? (() => {}),
    () => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT,
  )

  const [presets, setPresets] = useState<readonly StructuredOutputPreset[]>([])
  const [presetState, setPresetState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (loadPresets === undefined) return
    let stale = false
    setPresetState('loading')
    Promise.resolve()
      .then(() => loadPresets())
      .then((entries) => {
        if (stale) return
        setPresets(entries)
        setPresetState('ready')
      })
      .catch(() => {
        if (!stale) setPresetState('error')
      })
    return () => { stale = true }
  }, [loadPresets])

  const enabled = useMemo(() => snapshot.value?.presets ?? {}, [snapshot.value])

  if (scope === undefined || loadPresets === undefined) return null

  const setVisible = (presetId: string, visible: boolean): void => {
    void scope.set('presets', { ...enabled, [presetId]: visible })
  }

  return (
    <div style={STYLE.root}>
      <div style={STYLE.hint}>{translate(t, 'intro')}</div>
      {snapshot.status === 'loading' && <div style={STYLE.status}>{translate(t, 'loading')}</div>}
      {snapshot.status === 'unavailable' && <div style={STYLE.error}>{translate(t, 'unavailable')}</div>}
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
                disabled={preset.broken !== undefined || snapshot.status !== 'ready'}
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
