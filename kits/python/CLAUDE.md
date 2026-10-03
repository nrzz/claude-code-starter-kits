# {{name}}

{{where}}

## Commands
- Build: `{{build}}`
- Test one: `{{testOne}}`
- Test all: `{{test}}`
- Lint/format: {{lintFormat}}

## Conventions
- Type hints on public functions.
- `pathlib` for paths, `logging` instead of `print`.
- Catch specific exceptions; no bare `except:`.
- Tests in `tests/`; shared fixtures in `conftest.py`.
- {{addDep}}

## Token habits
- Read files by line range when they are large.
- Run one test file before the whole suite.
- Use the test-runner subagent for long builds and test logs.
