/**
 * dsh-plugin-structured-output — opencode-style json_schema structured output
 * over native dsh seams, with no dsh source changes.
 *
 * - `/json-schema <json>` stores an object-rooted dsh JSON Schema for the
 *   receiving session;
 * - a generic `StructuredOutput` tool is registered for every composed agent;
 * - the agent/pre-step listener appends opencode's instruction prompt when a
 *   schema is active, so the model routes its final answer through the tool;
 * - the tool validates `output` with the NATIVE dsh JSON Schema subset
 *   (`@deepseek-ai/dsh-tools`), rejecting malformed output instead of
 *   admitting it.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { parseAndValidateSchema, validateOutput } from './core/schema.ts'

export { parseAndValidateSchema, validateOutput } from './core/schema.ts'
export type { JsonSchemaNode }

export const name = 'structured-output'
export const inject = ['tools', 'commands']

const STRUCTURED_OUTPUT_DESCRIPTION =
  'Use this tool to return your final response in the requested structured format.'
const STRUCTURED_OUTPUT_SYSTEM_PROMPT =
  'IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text - you MUST call the StructuredOutput tool with your answer formatted according to the schema.'

function sessionIdOf(agent: Agent | undefined): string | undefined {
  return agent?.session.id
}

/** Minimal command registry face (dsh-commands owns the typed declaration). */
interface CommandsFace {
  register(definition: {
    name: string
    description: string
    handler: (invocation: { rawInput: string; agent: Agent }) => { kind: 'success'; text?: string } | { kind: 'error'; text: string }
  }): () => void
}

/**
 * Mount the tool, command, and per-session instruction injection.
 * @param ctx - host plugin context with tools and commands.
 */
export function apply(ctx: Context): void {
  const schemas = new Map<string, JsonSchemaNode>()
  const outputs = new Map<string, unknown>()

  ctx.tools.register(defineTool({
    name: 'StructuredOutput',
    description: STRUCTURED_OUTPUT_DESCRIPTION,
    parameters: {
      output: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description: 'Your final answer, formatted exactly according to the user-provided JSON schema.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const id = sessionIdOf(exec.agent)
      const schema = id === undefined ? undefined : schemas.get(id)
      if (schema === undefined) {
        throw new Error('no JSON schema is active for this session; run /json-schema first')
      }
      const violations = validateOutput(schema, args.output)
      if (violations.length > 0) {
        throw new Error(`StructuredOutput rejected by the active schema:\n${violations.join('\n')}`)
      }
      if (id !== undefined) outputs.set(id, args.output)
      return { output: args.output }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Structured output',
      rawInput: JSON.stringify(args.output),
    }),
  }))

  const commands = ctx.get('commands') as CommandsFace
  ctx.effect(() => commands.register({
    name: 'json-schema',
    description: 'Set the JSON schema the model must return through StructuredOutput',
    handler: (invocation) => {
      try {
        const schema = parseAndValidateSchema(invocation.rawInput)
        schemas.set(invocation.agent.session.id, schema)
        return { kind: 'success', text: 'JSON schema accepted; the next prompt requires StructuredOutput.' }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  }), 'structured-output: /json-schema command')

  ctx.on('agent/pre-step', async (
    { agent, messages },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const schema = schemas.get(agent.session.id)
    if (schema === undefined) return decision
    const instruction = createUserMessage({
      content: [{ type: 'text', text: STRUCTURED_OUTPUT_SYSTEM_PROMPT }],
      source: { kind: 'plugin', plugin: 'dsh-plugin-structured-output' },
    })
    return { kind: 'enter', messages: [...decision.messages, instruction] }
  })

  // The maps stay process-local; consumers/tests exercise the command and
  // tool through their registries.
}

declare module '@deepseek-ai/cordis' {
  // No service is exported; the tool and command are the public surface.
}
