---
name: test
description: Run tests, all or one file or filter
argument-hint: "[file or filter]"
disable-model-invocation: true
allowed-tools: {{allowTest}}
---

Run the project's tests with the test-runner subagent.
{{where}}
- All: `{{test}}`
- One file or test: `{{testOne}}`

Filter: "$ARGUMENTS" (empty means all).
Reply with only the failing tests: file:line and the first error line, at most 10 lines. If none fail, say so in one line.
