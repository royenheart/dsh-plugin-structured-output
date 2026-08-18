/**
 * Structured-output plugin smoke tests: pure schema parse/validate +
 * per-preset visibility registration.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { parseAndValidateSchema, validateOutput } from '../src/core/schema.ts'
import { enabledForPreset, SETTINGS_NAMESPACE } from '../src/index.ts'

test('accepts an object-rooted dsh JSON Schema subset', () => {
  const schema = parseAndValidateSchema(JSON.stringify({
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  }))
  assert.equal(schema.type, 'object')
})

test('rejects non-object schemas', () => {
  assert.throws(() => parseAndValidateSchema(JSON.stringify({ type: 'array', items: {} })))
})

test('validates StructuredOutput values against the schema', () => {
  const schema = parseAndValidateSchema(JSON.stringify({
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  }))
  assert.equal(validateOutput(schema, { answer: 'ok' }).length, 0)
  assert.ok(validateOutput(schema, { nope: true }).length > 0)
})

test('visibility is opt-in per preset and defaults to disabled', () => {
  assert.equal(enabledForPreset({ presets: {} }, 'opencode-omo'), false)
  assert.equal(enabledForPreset({ presets: {} }, undefined), false)
  assert.equal(enabledForPreset({ presets: { 'opencode-omo': true } }, 'opencode-omo'), true)
  assert.equal(enabledForPreset({ presets: { standard: true } }, undefined), true)
})

class MockSettings extends Service {
  constructor(ctx) {
    super(ctx, 'settings')
    this.value = { presets: {} }
    this.registrations = []
  }
  register(ns, schema, options) {
    this.registrations.push({ ns, options })
    return {
      get: () => this.value,
      watch: () => () => {},
    }
  }
}

class MockTools extends Service {
  constructor(ctx) {
    super(ctx, 'tools')
    this.definitions = []
  }
  register(definition) {
    this.definitions.push(definition)
    return () => {}
  }
}

class MockCommands extends Service {
  constructor(ctx) {
    super(ctx, 'commands')
    this.definitions = []
  }
  register(definition) {
    this.definitions.push(definition)
    return () => {}
  }
}

const toolsPlugin = { name: 'mock-tools', inject: [], apply: (ctx) => { ctx.plugin(MockTools) } }
const commandsPlugin = { name: 'mock-commands', inject: [], apply: (ctx) => { ctx.plugin(MockCommands) } }

async function agentSurface(preset, settings) {
  const ctx = new Context()
  await ctx.plugin(MockSettings)
  await ctx.plugin(toolsPlugin)
  await ctx.plugin(commandsPlugin)
  ctx.get('settings').value = settings
  const plugin = await import('../src/index.ts')
  await ctx.plugin(plugin)

  const agentCtx = new Context()
  await agentCtx.plugin(toolsPlugin)
  await agentCtx.plugin(commandsPlugin)
  const agent = {
    session: { id: 'test-session', header: { agentPreset: preset } },
    ctx: agentCtx,
  }
  ctx.emit('agent/created', { agent })
  return {
    root: ctx,
    agent: agentCtx,
    settings: ctx.get('settings'),
  }
}

test('apply registers the web-exposed settings namespace', async () => {
  const ctx = new Context()
  await ctx.plugin(MockSettings)
  await ctx.plugin(toolsPlugin)
  await ctx.plugin(commandsPlugin)
  const plugin = await import('../src/index.ts')
  await ctx.plugin(plugin)
  const registrations = ctx.get('settings').registrations
  assert.ok(registrations.some(entry => entry.ns === SETTINGS_NAMESPACE && entry.options.expose === 'web'))
  await ctx.fiber.dispose()
})

test('enabled preset sees StructuredOutput and /json-schema; disabled preset sees neither', async () => {
  const enabled = await agentSurface('opencode-omo', { presets: { 'opencode-omo': true } })
  assert.ok(enabled.agent.get('tools').definitions.some(definition => definition.name === 'StructuredOutput'))
  assert.ok(enabled.agent.get('commands').definitions.some(definition => definition.name === 'json-schema'))

  const disabled = await agentSurface('standard', { presets: {} })
  assert.equal(disabled.agent.get('tools').definitions.length, 0)
  assert.equal(disabled.agent.get('commands').definitions.length, 0)

  await enabled.root.fiber.dispose()
  await disabled.root.fiber.dispose()
})

test('agent surface applies the enabled settings at agent creation time', async () => {
  const ctx = new Context()
  await ctx.plugin(MockSettings)
  await ctx.plugin(toolsPlugin)
  await ctx.plugin(commandsPlugin)
  const plugin = await import('../src/index.ts')
  await ctx.plugin(plugin)

  const agentCtx = new Context()
  await agentCtx.plugin(toolsPlugin)
  await agentCtx.plugin(commandsPlugin)
  const agent = {
    session: { id: 'later-session', header: { agentPreset: 'opencode-omo' } },
    ctx: agentCtx,
  }
  ctx.emit('agent/created', { agent })
  assert.equal(agentCtx.get('tools').definitions.length, 0)

  ctx.get('settings').value = { presets: { 'opencode-omo': true } }
  ctx.emit('agent/created', { agent: {
    ...agent,
    session: { ...agent.session, id: 'later-session-2' },
    ctx: agentCtx,
  }})
  assert.equal(agentCtx.get('tools').definitions.length, 1)
  await ctx.fiber.dispose()
})
