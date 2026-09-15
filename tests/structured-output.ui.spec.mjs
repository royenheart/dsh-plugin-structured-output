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

/** Stand-in for the renderer-bound selector hook the slot inject face declares. */
function hookFor(scope) {
  return (select) => select(scope.getSnapshot())
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
    useStructuredOutputSettings: hookFor(fakeScope({ status: 'loading', writable: false })),
    loadPresets: () => new Promise(() => {}),
    t,
  })
  assert.match(hostText(loading.host), /正在读取设置/)
  assert.match(hostText(loading.host), /正在读取 Agent 预设/)
  await loading.unmount()

  const down = await mount({
    useStructuredOutputSettings: hookFor(fakeScope({ status: 'unavailable', writable: false })),
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
  })

  const view = await mount({
    useStructuredOutputSettings: hookFor(scope),
    loadPresets: async () => [
      { id: 'standard', isDefault: true, name: 'Standard', description: 'default mode' },
      { id: 'broken', isDefault: false, name: 'Broken', broken: 'missing bundle' },
      { id: 'code', isDefault: false, name: 'Code' },
    ],
    setPresets: async (presets) => {
      writes.push(presets)
      await scope.set('presets', presets)
      return undefined
    },
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
  assert.equal(writes[0].code, true)
  assert.equal(writes[0].standard, true)
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

/** Non-loopback page: the bound scope is memory-mode and reports 'unavailable'. */
class MockUnavailableSettingsScope extends Service {
  constructor(ctx) {
    super(ctx, 'settingsScope')
  }
  bind() {
    return fakeScope({ status: 'unavailable', writable: false })
  }
}

class MockConnection extends Service {
  constructor(ctx) {
    super(ctx, 'connection')
    this.rpc = { call: async () => ({ ok: true, value: { presets: {} } }) }
  }
}

test('client apply registers the 结构化输出工具 settings section', async () => {
  const ctx = new Context()
  await ctx.plugin(MockSlots)
  await ctx.plugin(MockLocale)
  await ctx.plugin(MockRemote)
  await ctx.plugin(MockAgentPresetsRemote)
  await ctx.plugin(MockSettingsScope)
  await ctx.plugin(MockConnection)
  const client = await import('../src/client/index.ts')
  await ctx.plugin(client)

  const registration = ctx.get('slots').registrations[0]
  assert.equal(registration.options.name, 'settings.section')
  assert.equal(registration.options.id, 'structured-output')
  assert.equal(registration.options.order, 45)
  assert.equal(registration.options.label(), '结构化输出工具')
  assert.equal(registration.Component, StructuredOutputSettings)
  const injectFace = registration.options.inject()
  assert.equal(typeof injectFace.hooks.structuredOutputSettings.getSnapshot, 'function')
  assert.equal(typeof injectFace.hooks.structuredOutputSettings.subscribe, 'function')
  assert.deepEqual(
    await injectFace.loadPresets(),
    [{ id: 'standard', isDefault: true }],
  )

  const locale = ctx.get('locale').namespaces[0]
  assert.equal(locale.ns, 'structured-output')
  assert.equal(locale.dictionaries.zh.nav, '结构化输出工具')
  assert.equal(ctx.get('settingsScope').bound[0].namespace, 'structured-output')
  await ctx.fiber.dispose()
})

test('remote fallback reads and writes through the authenticated RPC channel', async () => {
  const calls = []
  const view = await mount({
    useStructuredOutputSettings: hookFor(fakeScope({ status: 'unavailable', writable: false })),
    loadPresets: async () => [
      { id: 'standard', isDefault: true, name: 'Standard' },
      { id: 'code', isDefault: false, name: 'Code' },
    ],
    readRemoteSettings: async () => ({ presets: { standard: true } }),
    setPresets: async (presets) => {
      calls.push(presets)
      return { presets }
    },
    t,
  })
  await act(async () => { await Promise.resolve() })

  // The fallback read replaced the unavailable message with the loaded value.
  assert.doesNotMatch(hostText(view.host), /无法读取结构化输出设置/)
  assert.match(hostText(view.host), /Standard/)

  const boxes = [...view.host.querySelectorAll('input[type="checkbox"]')]
  assert.equal(boxes[0].checked, true)
  assert.equal(boxes[0].disabled, false)

  await act(async () => { boxes[1].click() })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].code, true)
  assert.equal(calls[0].standard, true)
  await view.unmount()
})

test('client apply routes remote reads and writes through the /structured-output channel', async () => {
  const rpcCalls = []
  class ChannelConnection extends Service {
    constructor(ctx) {
      super(ctx, 'connection')
      this.rpc = {
        call: async (channel, endpoint, payload) => {
          rpcCalls.push({ channel, endpoint, payload })
          if (endpoint === 'settings/get') return { ok: true, value: { presets: { standard: true } } }
          if (endpoint === 'settings/set') return { ok: true, value: { presets: payload.presets } }
          return { ok: false, error: { message: 'bad endpoint' } }
        },
      }
    }
  }

  const ctx = new Context()
  await ctx.plugin(MockSlots)
  await ctx.plugin(MockLocale)
  await ctx.plugin(MockRemote)
  await ctx.plugin(MockAgentPresetsRemote)
  await ctx.plugin(MockSettingsScope)
  await ctx.plugin(ChannelConnection)
  const client = await import('../src/client/index.ts')
  await ctx.plugin(client)

  // The bound scope answers 'ready' on loopback, so writes stay scope-local.
  const injectFace = ctx.get('slots').registrations[0].options.inject()
  assert.equal(await injectFace.setPresets({ standard: true }), undefined)
  assert.equal(rpcCalls.length, 0)

  const isolated = new Context()
  await isolated.plugin(MockSlots)
  await isolated.plugin(MockLocale)
  await isolated.plugin(MockRemote)
  await isolated.plugin(MockAgentPresetsRemote)
  await isolated.plugin(MockUnavailableSettingsScope)
  await isolated.plugin(ChannelConnection)
  await isolated.plugin(client)
  const remoteFace = isolated.get('slots').registrations[0].options.inject()
  assert.deepEqual(await remoteFace.readRemoteSettings(), { presets: { standard: true } })
  assert.deepEqual(await remoteFace.setPresets({ standard: true, code: false }), {
    presets: { standard: true, code: false },
  })
  assert.deepEqual(
    rpcCalls.map(call => [call.channel, call.endpoint]),
    [['/structured-output', 'settings/get'], ['/structured-output', 'settings/set']],
  )
  await ctx.fiber.dispose()
  await isolated.fiber.dispose()
})

function hostText(host) {
  return host.textContent ?? ''
}
