# {{name}}

{{where}}

## Commands
- Build: `{{build}}`
- Test one: `{{testOne}}`
- Test all: `{{test}}`
- Lint/format: {{lintFormat}}

## Conventions
- Propagate errors with `?`; avoid `unwrap()` in library code.
- Prefer borrowing (`&str`, `&[T]`) over cloning.
- Fix compiler and clippy warnings; do not silence them.
- Unit tests in `mod tests`; integration tests in `tests/`.

## Token habits
- Read files by line range when they are large.
- Run one test file before the whole suite.
- Use the test-runner subagent for long builds and test logs.
