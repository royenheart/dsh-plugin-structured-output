/**
 * Pure JSON Schema parsing/validation for the StructuredOutput tool.
 * Uses the native dsh JSON Schema subset (object-rooted, enforced keywords)
 * from @deepseek-ai/dsh-tools so validation behavior matches the rest of the
 * harness rather than shipping another validator.
 */
import {
  assertObjectJsonSchema, validateJsonSchemaValue,
} from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'

/** Parse and enforce an object-rooted dsh JSON Schema from command input. */
export function parseAndValidateSchema(raw: string): JsonSchemaNode {
  const trimmed = raw.trim()
  if (trimmed === '') throw new Error('json schema is empty')
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`invalid JSON schema: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    assertObjectJsonSchema(parsed)
  } catch (error) {
    throw new Error(`unsupported JSON schema: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parsed
}

/** Validate one StructuredOutput value against the stored schema. */
export function validateOutput(schema: JsonSchemaNode, output: unknown): string[] {
  return validateJsonSchemaValue(schema, output, 'output')
}
