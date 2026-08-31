/**
 * Settings UI: slot registration, locale copy, loading/error/ready, and toggles.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { JSDOM } from 'jsdom'
import { Context, Service } from '@deepseek-ai/cordis'
import { StructuredOutputSettings } from '../src/client/StructuredOutputSettings.tsx'
import { en, zh } from '../src/client/locales.ts'

function installDom() {
  if (globalThis.document !== undefined) return
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://127.0.0.1/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

installDom()

function t(key, vars) {
  const template = zh[key]
  return vars?.name === undefined ? template : template.replace('{name}', vars.name)
}

function fakeScope(snapshot, onSet) {
  let current = snapshot
  const listeners = new Set()
  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field, value) => {
      onSet?.(field, value)
      current = {
        ...current,
        status: 'ready',
        writable: true,
        value: { ...current.value, [field]: value },
      }
      for (const listener of listeners) listener()
    },
  }
}

async function mount(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(StructuredOutputSettings, props))
  })
  return {
    host,
    async rerender(next) {
      await act(async () => {
        root.render(createElement(StructuredOutputSettings, next))
      })
    },
    async unmount() {
      await act(async () => { root.unmount() })
      host.remove()
    },
  }
}

test('English locale covers every Chinese key', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

test('missing inject props render nothing', async () => {
  const view = await mount({})
  assert.equal(hostText(view.host), '')
  await view.unmount()
})

test('loading and unavailable copy is the settings UX, not a spinner hole', async () => {
  const loading = await mount({
    scope: fakeScope({ status: 'loading', writable: false }),
    loadPresets: () => new Promise(() => {}),
    t,
  })
  assert.match(hostText(loading.host), /正在读取设置/)
  assert.match(hostText(loading.host), /正在读取 Agent 预设/)
  await loading.unmount()

  const down = await mount({
    scope: fakeScope({ status: 'unavailable', writable: false }),
    loadPresets: async () => { throw new Error('offline') },
    t,
  })
  await act(async () => { await Promise.resolve() })
  assert.match(hostText(down.host), /无法读取结构化输出设置/)
  assert.match(hostText(down.host), /暂时无法读取 Agent 预设/)
  await down.unmount()
})

test('ready list shows default/broken badges, disables broken rows, and persists toggles', async () => {
  const writes = []
  const scope = fakeScope({
    status: 'ready',
    writable: true,
    value: { presets: { standard: true } },
  }, (field, value) => { writes.push({ field, value }) })

  const view = await mount({
    scope,
    loadPresets: async () => [
      { id: 'standard', isDefault: true, name: 'Standard', description: 'default mode' },
      { id: 'broken', isDefault: false, name: 'Broken', broken: 'missing bundle' },
      { id: 'code', isDefault: false, name: 'Code' },
    ],
    t,
  })
  await act(async () => { await Promise.resolve() })

  const text = hostText(view.host)
  assert.match(text, /选择哪些 Agent 预设/)
  assert.match(text, /Standard/)
  assert.match(text, /默认/)
  assert.match(text, /Broken/)
  assert.match(text, /该预设不可用/)
  assert.match(text, /Code/)

  const boxes = [...view.host.querySelectorAll('input[type="checkbox"]')]
  assert.equal(boxes.length, 3)
  assert.equal(boxes[0].checked, true)
  assert.equal(boxes[0].disabled, false)
  assert.equal(boxes[1].disabled, true)
  assert.equal(boxes[2].checked, false)
  assert.equal(boxes[0].getAttribute('aria-label'), '在 Standard 中启用')

  await act(async () => {
    boxes[2].click()
  })
  assert.equal(writes.length, 1)
  assert.equal(writes[0].field, 'presets')
  assert.equal(writes[0].value.code, true)
  assert.equal(writes[0].value.standard, true)
  await view.unmount()
})

class MockSlots extends Service {
  constructor(ctx) {
    super(ctx, 'slots')
    this.registrations = []
  }
  inject(name, factory) {
    if (name !== 'settings.section') throw new Error(`unexpected slot ${name}`)
    return factory()
  }
  register(options, Component) {
    this.registrations.push({ options, Component })
    return () => {}
  }
}

class MockLocale extends Service {
  constructor(ctx) {
    super(ctx, 'locale')
    this.namespaces = []
  }
  register(ns, dictionaries) {
    this.namespaces.push({ ns, dictionaries })
  }
  bind(ns) {
    return (key, vars) => {
      const template = this.namespaces.find(entry => entry.ns === ns)?.dictionaries.zh[key] ?? key
      return vars?.name === undefined ? template : template.replace('{name}', vars.name)
    }
  }
}

class MockRemote extends Service {
  constructor(ctx) {
    super(ctx, 'remote')
  }
}

class MockAgentPresetsRemote extends Service {
  constructor(ctx) {
    super(ctx, 'remote.agentPresets')
  }
  async list() {
    return { ok: true, value: { presets: [{ id: 'standard', isDefault: true }] } }
  }
}

class MockSettingsScope extends Service {
  constructor(ctx) {
    super(ctx, 'settingsScope')
    this.bound = []
  }
  bind(options) {
    this.bound.push(options)
    return fakeScope({ status: 'ready', writable: true, value: { presets: {} } })
  }
}

test('client apply registers the 结构化输出工具 settings section', async () => {
  const ctx = new Context()
  await ctx.plugin(MockSlots)
  await ctx.plugin(MockLocale)
  await ctx.plugin(MockRemote)
  await ctx.plugin(MockAgentPresetsRemote)
  await ctx.plugin(MockSettingsScope)
  const client = await import('../src/client/index.ts')
  await ctx.plugin(client)

  const registration = ctx.get('slots').registrations[0]
  assert.equal(registration.options.name, 'settings.section')
  assert.equal(registration.options.id, 'structured-output')
  assert.equal(registration.options.order, 45)
  assert.equal(registration.options.label(), '结构化输出工具')
  assert.equal(registration.Component, StructuredOutputSettings)
  assert.deepEqual(
    await registration.options.inject().loadPresets(),
    [{ id: 'standard', isDefault: true }],
  )

  const locale = ctx.get('locale').namespaces[0]
  assert.equal(locale.ns, 'structured-output')
  assert.equal(locale.dictionaries.zh.nav, '结构化输出工具')
  assert.equal(ctx.get('settingsScope').bound[0].namespace, 'structured-output')
  await ctx.fiber.dispose()
})

function hostText(host) {
  return host.textContent ?? ''
}
