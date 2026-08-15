/**
 * Structured-output plugin smoke tests: pure schema parse/validate + a Cordis
 * apply smoke with mock tools/commands registries.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { parseAndValidateSchema, validateOutput } from '../src/core/schema.ts'

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

class MockTools extends Service {
  definitions = []
  constructor(ctx) {
    super(ctx, 'tools')
  }
  register(definition) {
    this.definitions.push(definition)
    return () => {}
  }
}

class MockCommands extends Service {
  definitions = []
  constructor(ctx) {
    super(ctx, 'commands')
  }
  register(definition) {
    this.definitions.push(definition)
    return () => {}
  }
}

const toolsPlugin = { name: 'mock-tools', inject: [], apply: (ctx) => { ctx.plugin(MockTools) } }
const commandsPlugin = { name: 'mock-commands', inject: [], apply: (ctx) => { ctx.plugin(MockCommands) } }

test('apply registers StructuredOutput tool and /json-schema command', async () => {
  const ctx = new Context()
  await ctx.plugin(toolsPlugin)
  await ctx.plugin(commandsPlugin)
  const plugin = await import('../src/index.ts')
  await ctx.plugin(plugin)
  const tools = ctx.get('tools')
  const commands = ctx.get('commands')
  assert.ok(tools.definitions.some(definition => definition.name === 'StructuredOutput'))
  assert.ok(commands.definitions.some(definition => definition.name === 'json-schema'))
  await ctx.fiber.dispose()
})
