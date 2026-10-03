# {{name}}

{{where}}

## Commands
- Build: `{{build}}`
- Test one: `{{testOne}}`
- Test all: `{{test}}`
- Lint/format: {{lintFormat}}

## Conventions
- Handle every error; wrap with `fmt.Errorf("...: %w", err)`.
- `context.Context` first; no package-level state.
- Table-driven tests with `t.Run`.
- Small interfaces, declared where they are used.

## Token habits
- Read files by line range when they are large.
- Run one test file before the whole suite.
- Use the test-runner subagent for long builds and test logs.
