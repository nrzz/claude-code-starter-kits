# {{name}}

{{where}}

## Commands
- Build: `{{build}}`
- Test one: `{{testOne}}`
- Test all: `{{test}}`
- Lint/format: {{lintFormat}}

## Conventions
- Follow the state management in use; do not mix.
- `const` constructors and widgets wherever possible.
- No `BuildContext` across async gaps; check `mounted`.
- Keep `build` methods small; extract widgets.
- Do not edit `*.g.dart` or `*.freezed.dart`.

## Token habits
- Read files by line range when they are large.
- Run one test file before the whole suite.
- Use the test-runner subagent for long builds and test logs.
