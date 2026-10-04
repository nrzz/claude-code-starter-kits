# Changelog

All notable changes to Claude Code starter kits are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-10-04

- Fixed: `--list` printed Node's description running into its file names ("...Expresspackage.json"); every column is now as wide as its longest entry.
- The report's `.gitignore` row says "2 entries added at the end, under a comment line" instead of "2 lines", which left out the comment line.
- README: which commands come from the project's own files (Node's scripts) and which are standard toolchain commands, the extra allow rules (`dotnet restore`, `flutter pub get`, `dart pub get`), `yarn npm publish` in Node's deny list, the folder names detection skips, `settings.gradle.kts`, the whitespace rule of the token estimate, and Node 18 in CI.

## [1.0.0] - 2026-10-04

- First release: kits for .NET, Node, Python, Go, Flutter and Java with a CLAUDE.md under 250 tokens, permission rules, user-only `/test` and `/check` skills and a Haiku test-runner subagent; nothing is ever overwritten.

[1.0.1]: https://github.com/nrzz/claude-code-starter-kits/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/nrzz/claude-code-starter-kits/releases/tag/v1.0.0
