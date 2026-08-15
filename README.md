# @royenheart/dsh-plugin-structured-output

opencode-style `json_schema` structured output for dsh agents, built entirely
on native dsh seams (no dsh source changes):

- `/json-schema <json>` stores an object-rooted JSON Schema for the current
  session;
- a generic `StructuredOutput` tool is registered for every composed agent;
- the next prompt receives opencode's instruction to return the final answer
  through `StructuredOutput` instead of plain text;
- the tool validates the output with the native dsh JSON Schema subset
  (`@deepseek-ai/dsh-tools`) and rejects malformed values.

## Install

```sh
dsh plugin --profile web add link:/path/to/dsh-plugin-structured-output
```

then add `@royenheart/dsh-plugin-structured-output` to the profile
composition (e.g. `cordis.patch.yml`):

```yaml
- insert:
    - id: structured-output
      name: '@royenheart/dsh-plugin-structured-output'
```

## Usage

```text
/json-schema {"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}
What is the answer to life, the universe, and everything?
```

The model must then call `StructuredOutput` with a valid object.

Supported schemas follow dsh's enforced JSON Schema subset: any JSON root,
object `properties`/`required`/boolean `additionalProperties`, array `items`,
scalar `enum`/`const`, and exact-one `oneOf`. Unsupported keywords are
rejected at `/json-schema` time.
