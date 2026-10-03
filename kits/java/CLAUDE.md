# {{name}}

{{where}}

## Commands
- Build: `{{build}}`
- Test one: `{{testOne}}`
- Test all: `{{test}}`
- Lint/format: {{lintFormat}}

## Conventions
- Constructor injection; fields stay `final`.
- No empty catch blocks; never catch `Exception` broadly.
- Keep the package layout; no wildcard imports.
- Do not edit `target/` or `build/`.
- {{springNote}}

## Token habits
- Read files by line range when they are large.
- Run one test file before the whole suite.
- Use the test-runner subagent for long builds and test logs.
