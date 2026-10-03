---
name: check
description: Build, lint and test; show only failures
disable-model-invocation: true
allowed-tools: {{allowCheck}}
---

With the test-runner subagent, run these in order and stop at the first failure:
{{where}}
- `{{build}}`
- `{{typecheck}}`
- `{{lint}}`
- `{{test}}`

Reply with only what failed: file:line and the first error line, at most 10 lines. If all pass, say so in one line.
