# {{name}}

{{where}}

## Commands
- Build: `{{build}}`
- Typecheck: `{{typecheck}}`
- Test one: `{{testOne}}`
- Test all: `{{test}}`
- Lint/format: {{lintFormat}}

## Conventions
- {{tsNote}}
- {{frameworkNote}}
- Keep the module system and import style.
- Ask before adding dependencies; never edit the lockfile.
- Await every promise.
- Never edit generated build output.

## Token habits
- Read files by line range when they are large.
- Run one test file before the whole suite.
- Use the test-runner subagent for long builds and test logs.
