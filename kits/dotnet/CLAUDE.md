# {{name}}

{{where}}

## Commands
- Build: `{{build}}`
- Test one: `{{testOne}}`
- Test all: `{{test}}`
- Format: `{{format}}`

## Conventions
- Keep nullable on; fix warnings, do not suppress them.
- No `.Result` or `.Wait()`; pass `CancellationToken`.
- Constructor injection; no static state.
- Log with `ILogger`, not `Console`.

## Token habits
- Read files by line range when they are large.
- Run one test file before the whole suite.
- Use the test-runner subagent for long builds and test logs.
