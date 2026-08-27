/**
 * Host product-path tests: schema helpers, per-preset registration,
 * /json-schema, StructuredOutput execute, and agent/pre-step injection.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import { parseAndValidateSchema, validateOutput } from '../src/core/schema.ts'
import { enabledForPreset, SETTINGS_NAMESPACE } from '../src/index.ts'

const OBJECT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
})

test('accepts an object-rooted dsh JSON Schema subset', () => {
  const schema = parseAndValidateSchema(OBJECT_SCHEMA)
  assert.equal(schema.type, 'object')
})

test('rejects empty, invalid JSON, and non-object schemas', () => {
  assert.throws(() => parseAndValidateSchema(''), /empty/)
  assert.throws(() => parseAndValidateSchema('{'), /invalid JSON schema/)
  assert.throws(() => parseAndValidateSchema(JSON.stringify({ type: 'array', items: {} })))
})

test('validates StructuredOutput values against the schema', () => {
  const schema = parseAndValidateSchema(OBJECT_SCHEMA)
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

async function bootHost(settingsValue = { presets: {} }) {
  const ctx = new Context()
  await ctx.plugin(MockSettings)
  await ctx.plugin(toolsPlugin)
  await ctx.plugin(commandsPlugin)
  ctx.get('settings').value = settingsValue
  const plugin = await import('../src/index.ts')
  await ctx.plugin(plugin)
  return ctx
}

async function spawnAgent(root, preset, sessionId) {
  const agentCtx = new Context()
  await agentCtx.plugin(toolsPlugin)
  await agentCtx.plugin(commandsPlugin)
  const agent = {
    session: { id: sessionId, header: { agentPreset: preset } },
    ctx: agentCtx,
  }
  root.emit('agent/created', { agent })
  return agent
}

function toolNamed(agent, name) {
  return agent.ctx.get('tools').definitions.find(definition => definition.name === name)
}

function commandNamed(agent, name) {
  return agent.ctx.get('commands').definitions.find(definition => definition.name === name)
}

test('apply registers the web-exposed settings namespace', async () => {
  const ctx = await bootHost()
  const registrations = ctx.get('settings').registrations
  assert.ok(registrations.some(entry => entry.ns === SETTINGS_NAMESPACE && entry.options.expose === 'web'))
  await ctx.fiber.dispose()
})

test('enabled preset sees StructuredOutput and /json-schema; disabled preset sees neither', async () => {
  const enabledRoot = await bootHost({ presets: { 'opencode-omo': true } })
  const enabled = await spawnAgent(enabledRoot, 'opencode-omo', 'enabled-session')
  assert.ok(toolNamed(enabled, 'StructuredOutput'))
  assert.ok(commandNamed(enabled, 'json-schema'))

  const disabledRoot = await bootHost({ presets: {} })
  const disabled = await spawnAgent(disabledRoot, 'standard', 'disabled-session')
  assert.equal(disabled.ctx.get('tools').definitions.length, 0)
  assert.equal(disabled.ctx.get('commands').definitions.length, 0)

  await enabledRoot.fiber.dispose()
  await disabledRoot.fiber.dispose()
})

test('agent surface applies the enabled settings at agent creation time', async () => {
  const ctx = await bootHost({ presets: {} })
  const agent = await spawnAgent(ctx, 'opencode-omo', 'later-session')
  assert.equal(agent.ctx.get('tools').definitions.length, 0)

  ctx.get('settings').value = { presets: { 'opencode-omo': true } }
  const later = await spawnAgent(ctx, 'opencode-omo', 'later-session-2')
  assert.equal(later.ctx.get('tools').definitions.length, 1)
  await ctx.fiber.dispose()
})

test('/json-schema stores a schema and StructuredOutput validates against it', async () => {
  const ctx = await bootHost({ presets: { standard: true } })
  const agent = await spawnAgent(ctx, 'standard', 'schema-session')
  const command = commandNamed(agent, 'json-schema')
  const tool = toolNamed(agent, 'StructuredOutput')

  const rejected = command.handler({ rawInput: '{', agent })
  assert.equal(rejected.kind, 'error')
  assert.match(rejected.text, /invalid JSON schema/)

  await assert.rejects(
    () => tool.execute({ output: { answer: 'too soon' } }, { agent }),
    /run \/json-schema first/,
  )

  const accepted = command.handler({ rawInput: OBJECT_SCHEMA, agent })
  assert.equal(accepted.kind, 'success')
  assert.match(accepted.text, /StructuredOutput/)

  await assert.rejects(
    () => tool.execute({ output: { nope: true } }, { agent }),
    /rejected by the active schema/,
  )

  const ok = await tool.execute({ output: { answer: 'done' } }, { agent })
  assert.deepEqual(ok, { output: { answer: 'done' } })
  await ctx.fiber.dispose()
})

test('agent/pre-step appends the StructuredOutput instruction only when a schema is active', async () => {
  const ctx = await bootHost({ presets: { standard: true } })
  const agent = await spawnAgent(ctx, 'standard', 'prestep-session')
  const baseline = { kind: 'enter', messages: [{ id: 'user-1' }] }
  const dispatch = agentEvents(ctx, agent)

  const before = await dispatch.waterfall(
    'agent/pre-step',
    { messages: baseline.messages, turn: 1, step: 1, signal: new AbortController().signal },
    async () => baseline,
  )
  assert.equal(before.kind, 'enter')
  assert.equal(before.messages.length, 1)

  commandNamed(agent, 'json-schema').handler({ rawInput: OBJECT_SCHEMA, agent })

  const after = await dispatch.waterfall(
    'agent/pre-step',
    { messages: baseline.messages, turn: 1, step: 1, signal: new AbortController().signal },
    async () => baseline,
  )
  assert.equal(after.kind, 'enter')
  assert.equal(after.messages.length, 2)
  const instruction = after.messages[1]
  assert.equal(instruction.role, 'user')
  const text = instruction.content.map(block => block.text).join('')
  assert.match(text, /StructuredOutput/)
  assert.match(text, /MUST/)

  const rejected = await dispatch.waterfall(
    'agent/pre-step',
    { messages: [], turn: 1, step: 1, signal: new AbortController().signal },
    async () => ({ kind: 'reject' }),
  )
  assert.equal(rejected.kind, 'reject')
  await ctx.fiber.dispose()
})
