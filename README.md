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

`lib/` is generated locally and is not committed. `install.py` always builds
the repository's own toolchain first (`npm install` when the toolchain is
missing, then `npm run build`) and only reports an error when npm itself is
missing.

Install/uninstall idempotently with the bundled script (stdlib-only
Python). The package ships its own `cordis.patch.yml` (id
`structured-output`) and declares `dsh.bundle.patch`, so the script only links
the package into the profile `node_modules`, adds the `link:` dependency, and
appends the package to `dsh.profile.bundles`. The profile's own
`cordis.patch.yml` is never modified:

```sh
python3 install.py install --profile web          # install
python3 install.py uninstall --profile web        # remove
python3 install.py install --profile web --home "$DSH_HOME"   # explicit home
```

Manual alternative:

```sh
dsh plugin --profile web add link:/path/to/dsh-plugin-structured-output
```

`dsh plugin` reconciles `dsh.profile.bundles` from the installed package's
`dsh.bundle` declaration, so no profile patch edit is needed either.

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
