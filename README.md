# Claude Code starter kits

[![test](https://github.com/nrzz/claude-code-starter-kits/actions/workflows/test.yml/badge.svg)](https://github.com/nrzz/claude-code-starter-kits/actions/workflows/test.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933.svg) ![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen.svg) [![part of the Claude Code toolkit](https://img.shields.io/badge/Claude%20Code-toolkit-d97757.svg)](https://github.com/nrzz/claude-code-toolkit)

One command sets up a lean, safe `.claude/` for your project: a short `CLAUDE.md` with your real commands, permissions that skip the prompts you would approve anyway and block the ones you never should, two user-only skills, and a cheap test-runner subagent. It detects .NET, Node.js, Python, Go, Flutter and Java projects, never replaces a file you already have, and tells you what the files cost in tokens before you commit them.

## What it costs in tokens

Every session pays for `CLAUDE.md` and for the one-line listing of the `test-runner` agent. The two skills are user-only (`disable-model-invocation: true`), and Claude Code leaves user-only skills out of the list it gives the model, so they cost nothing until you type them. `settings.json` holds permission rules that Claude Code applies itself.

<!-- token-table:start -->
In every session (estimated tokens):

| Stack | `CLAUDE.md` | `test-runner` in the agent list | Total in every session | Skills in the skill list |
| --- | ---: | ---: | ---: | ---: |
| .NET | 199 | 36 | **235** | 0 |
| Node.js | 226 | 36 | **262** | 0 |
| Python | 201 | 36 | **237** | 0 |
| Go | 196 | 36 | **232** | 0 |
| Flutter | 207 | 36 | **243** | 0 |
| Java | 211 | 36 | **247** | 0 |

Only when you use it (estimated tokens; each is a one-off, not a per-turn cost):

| Stack | `/test` | `/check` | `test-runner` prompt (runs on Haiku) |
| --- | ---: | ---: | ---: |
| .NET | 113 | 105 | 178 |
| Node.js | 96 | 93 | 157 |
| Python | 98 | 79 | 137 |
| Go | 99 | 84 | 148 |
| Flutter | 96 | 86 | 146 |
| Java | 98 | 89 | 152 |

Measured on a sample project per stack with every command present, so they are close to the most a typical project costs; a long solution or project name adds a few tokens. Samples: .NET: a solution with a web project and a test project; Node.js: a TypeScript Next.js app with pnpm and every script; Python: a Django project with uv, ruff and pytest; Go: a module with a main package and golangci-lint; Flutter: a Flutter app with an Android folder; Java: a Spring Boot app built with the Maven wrapper and Spotless.
<!-- token-table:end -->

`CLAUDE.md` is the one file with a budget: under 250 tokens for every stack, enforced by a test on the sample above and on awkward cases (long names, a project in a sub-folder, every package manager). A long solution or project name is repeated in several commands and adds tokens, so the command warns when a generated `CLAUDE.md` goes over.

The numbers are estimates from a rule of thumb, not a tokenizer: letters cost `ceil(length / 4)`, digits `ceil(length / 3)`, each run of punctuation one token, each run of whitespace one token except a single space between two words. It errs high on purpose, so real counts should be lower. It has not been checked against Claude's tokenizer. The rule is in `src/tokens.mjs`, and `node scripts/token-table.mjs --write` rebuilds the tables above from the real templates; a test fails if the README and the templates disagree.

## Use

In your project folder:

```text
npx -y github:nrzz/claude-code-starter-kits --dry-run
npx -y github:nrzz/claude-code-starter-kits
```

The first shows every file and merge it would make and writes nothing. The second does it. Either way it ends with a summary of what was created, merged or skipped, and what the files cost per session. It needs Node 18 or newer and nothing else.

| Option | What it does |
| --- | --- |
| `[stack]` | `dotnet`, `node`, `python`, `go`, `flutter` or `java`. Left out, the stack is detected from your files. Also accepted: `csharp`, `ts`, `typescript`, `js`, `javascript`, `nodejs`, `py`, `golang`, `dart`. |
| `--dir <path>` | The project folder. Default: the current folder. |
| `--dry-run` | Show every file and merge that would happen. Writes nothing. |
| `--print` | Like `--dry-run`, and print the content of every file (for a merge, the rules that would be added). |
| `--merge` | If `CLAUDE.md` exists, append the starter to it as a marked section, once, instead of writing `CLAUDE.starter.md`. |
| `--list` | List the stacks and what each is detected from. |
| `-h`, `--help`, `-v`, `--version` | Usage and version. |

Exit code 0 means done. Exit code 1 means something needs you: a bad option, nothing detected, a folder it refuses to run in, a `settings.json` that was left alone, or a write that failed. Exit code 2 is an unexpected error.

A run in a project that already has a `CLAUDE.md`, a `settings.json` and a `.gitignore`, and a .NET project next to the Node one:

```text
Stack     Node.js: detected from package.json (TypeScript, Next.js, pnpm)
Also      .NET (server/Api.csproj) was found too; run `claude-starter dotnet` to use that instead.

Commands found
  build      pnpm run build
  typecheck  pnpm run typecheck
  test       pnpm run test
  test one   pnpm run test <file>
  lint       pnpm run lint
  format     pnpm run format
  run        pnpm run dev   (not written to CLAUDE.md: it would cost tokens in every session)

Files
  created      CLAUDE.starter.md              CLAUDE.md already exists; Claude Code does not read this name
  merged       .claude/settings.json          +20 rules added; backup .claude/settings.json.bak-starter-20261004-013112
  created      .claude/skills/test/SKILL.md   user-only skill, 0 tokens until you type it
  created      .claude/skills/check/SKILL.md  user-only skill, 0 tokens until you type it
  created      .claude/agents/test-runner.md  about 36 tokens in every session
  merged       .gitignore                     2 lines added at the end
```

## What each kit contains

| File | What it is |
| --- | --- |
| `CLAUDE.md` | The project's real commands (build, test one file or test, test all, lint and format), 4 to 6 short conventions for the stack, and three token habits: read files by line range when they are large, run one test file before the whole suite, use the test-runner subagent for long builds and test logs. |
| `.claude/settings.json` | `permissions.allow` for the project's own build, test, lint and format commands and for `git status`, `git diff` and `git log`; `permissions.deny` for `.env` files, `.pem` files, `secrets/`, force-pushes and the stack's publishing commands. Nothing else. |
| `.claude/skills/test/SKILL.md` | `/test [file or filter]`. User-only. Runs the tests through the subagent and replies with only the failing tests, each as file:line and its first error line, at most 10 lines. |
| `.claude/skills/check/SKILL.md` | `/check`. User-only. Build, lint and test in order, stopping at the first failure, with the same short reply. |
| `.claude/agents/test-runner.md` | A subagent on Haiku with `Bash`, `Read`, `Grep` and `Glob`. It runs the commands, reads the long log itself and returns at most 15 lines, so the log never enters your main conversation. Its description is 70 characters. |
| `.gitignore` | Two lines added, once: `CLAUDE.local.md` and `.claude/settings.local.json`, the personal files Claude Code lets you keep beside the shared ones. |

What changes per stack:

| Stack | Detected from | Commands filled in | Allowed without asking | Denied |
| --- | --- | --- | --- | --- |
| .NET | `*.sln`, `*.slnx`, `*.csproj`, `*.fsproj` | `dotnet build`, `test`, `format` with the solution file (or the single project file); test one is `--filter "FullyQualifiedName~<name>"`; `/check` lints with `dotnet format --verify-no-changes` | `dotnet build`, `test`, `format`, `restore` | `dotnet nuget push` |
| Node.js | `package.json` | Your `build`, `typecheck`, `test`, `lint` and `format` scripts, only the ones that exist, run with the package manager the lockfile names (npm, pnpm, yarn or bun). Notes for TypeScript, and for Next.js, React or Express when they are dependencies | `<pm> run <script>` for those scripts and for variants such as `test:unit` or `lint:fix` (never `watch` or `debug` variants, `start`, `deploy` or `release`), and `<pm> test` | `npm publish`, `pnpm publish`, `yarn publish`, `bun publish` |
| Python | `pyproject.toml`, `requirements.txt`, `setup.py`, `setup.cfg` | `pytest`, behind `uv run` or `poetry run` when the project uses uv or poetry; `ruff check` and `ruff format` when ruff is configured or listed, else `black` or `flake8` | `pytest`, `ruff`, `black` or `flake8` as the project uses them | `twine upload`, `uv publish`, `poetry publish` |
| Go | `go.mod` | `go build ./...`, `go test ./...`, `go test ./<pkg> -run <Test>`, `gofmt -w .`, and `golangci-lint run` if the project has a config for it, else `go vet ./...` | `go build`, `go test`, `go vet` or `golangci-lint run`, `gofmt` | `goreleaser release` |
| Flutter | `pubspec.yaml` | `flutter test`, `flutter analyze`, `dart format .`, and `flutter build apk`, `web` or `ios` by the platform folders; a Dart package without the Flutter SDK gets `dart test` and `dart analyze` | `flutter` or `dart` `test`, `analyze`, `format`, `flutter build`, `flutter pub get`, `dart pub get` | `flutter pub publish`, `dart pub publish` |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts`, `settings.gradle` | `./mvnw` or `mvn` (Maven), `./gradlew` or `gradle` (Gradle), by whether the wrapper is there; `package -DskipTests` or `build -x test`, `test`, test one by class; Spotless or Checkstyle only if the build file names it. A note for Spring Boot | The build, test, lint and format commands it found | `mvn deploy`, `./mvnw deploy`, `gradle publish`, `./gradlew publish` |

Every stack also denies `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./secrets/**)`, `git push --force` and `git push -f`.

Two things to know about those rules. The `Read` rules stop Claude's own file tools; they are not a sandbox for shell commands. And `./.env.*` also matches `.env.example`, so Claude cannot read that either: remove the rule if you want it to.

The allow rules run your project's code, as any test run does. They are exact prefixes such as `Bash(dotnet test:*)` and never name an interpreter, a launcher, `find`, `xargs`, `npx`, `gh api` or `git --upload-pack`, and never mix `:*` with `*` in one rule; a test checks that on every kit.

## Merging with what you have

Nothing you already have is replaced.

- **`CLAUDE.md`** is never edited unless you pass `--merge`. If it exists, the starter is written to `CLAUDE.starter.md`, which Claude Code does not read, so it costs nothing until you combine them, and the command says how. With `--merge`, the starter is appended at the end between `<!-- claude-starter:begin -->` and `<!-- claude-starter:end -->`, with its headings one level deeper. Running again finds the marker and does nothing. An empty `CLAUDE.md` is filled in. A `CLAUDE.md` that already is the starter, or that already has the starter's last token habit because you merged it by hand, is left alone.
- **`.claude/settings.json`** is read without being modified. If it is not valid JSON, or its `permissions` section is not shaped as Claude Code expects, it is left untouched, the kit's rules are printed so you can paste them in, and the exit code is 1; everything else is still written. Otherwise it is copied to `settings.json.bak-starter-<YYYYMMDD-HHMMSS>` in the same folder, then merged at the key level: every key of yours stays as it is, `allow` and `deny` get our rules added after yours without duplicates, and the file keeps its indentation and line endings. A rule you already keep in a different list (an `allow` of something we would deny, say) stays where you put it and is reported. If there is nothing to add, there is no write and no backup.
- **Skills and the agent** are written only when no file of that name exists. One that exists is kept, and reported as unchanged when it equals ours. If you already have a `/test` command in `.claude/commands/test.md`, no `/test` skill is added.
- **`.gitignore`** only gets lines added at the end, and only the ones that are missing. `.claude/settings.local.json` and `CLAUDE.local.md` themselves are never touched.
- **Where it runs.** It refuses to run in your home folder (where `.claude/` is your personal Claude Code config, not a project's), in a drive root, and inside Claude Code's config folder.

Run it again at any time: a second run changes nothing.

## How it works

- **Detection.** It looks for marker files in the project folder and three levels below it, skipping dot-folders, `node_modules`, `bin`, `obj`, `dist`, `build`, `target`, `vendor`, `venv` and similar. The match closest to the root wins. In the same folder the order is .NET, Java, Go, Flutter, Python, Node.js, because many projects that are not Node projects have a `package.json` only for tooling. The other stacks it found are listed, with the command to use one instead, and a Flutter or Node project's `android/` Gradle build is not offered as a second project. If nothing matches, it lists the stacks and exits 1. A project found in a sub-folder gets its kit at the project root, and `CLAUDE.md` says where the commands run.
- **Commands.** Each stack module reads the project's own files: the `scripts` of `package.json` and the lockfile for the package manager, the solution file name, `uv.lock` or `[tool.poetry]`, `golangci` config, `mvnw` and `gradlew`, plugin names in `pom.xml` and `build.gradle`. A command the project does not have is left out, never invented. Names that come from project files are cleaned to plain characters before they reach a file Claude reads in every session.
- **Templates.** The kits are plain files under `kits/<stack>/` and `kits/_shared/` with `{{placeholders}}`. A line whose placeholder is empty is dropped, and so is a heading left with nothing under it. A placeholder that is not defined stops rendering with an error that names the file, so a typo cannot silently drop a line.
- **Plan, then apply.** Every decision (create, skip, merge, write an alternative file) is made first, without writing. `--dry-run` and `--print` stop there, so they show exactly what a real run does. New files are created with an exclusive flag, so a file that appears in between is never overwritten.
- **Why the test-runner.** A failing test run can print thousands of lines, and everything Claude reads stays in the conversation for the rest of the session. `/test` and `/check` hand the run to the subagent, which runs on Haiku and returns at most 15 lines.

## What was verified, and how

Checked on 2026-10-04 on Windows 11 with Node 24.19. The workflow in `.github/workflows/test.yml` runs the same tests on Windows, macOS and Linux with Node 20, 22 and 24.

- **Over 250 automated tests** (`npm test`), all running in throwaway folders under the OS temp folder. The command is run with `HOME`, `USERPROFILE` and `CLAUDE_CONFIG_DIR` pointed at another throwaway folder, and runs inside the test process are given a fake home, so no test reads or writes a real Claude config. They cover detection of each stack and of mixed repositories; every placeholder (package manager from the lockfile, scripts present and absent, solution names, wrappers, linters); the six kits scaffolded into temp folders and every file checked; the token budgets; and the never-overwrite rules: an existing `CLAUDE.md`, `--merge` once, skills and agent kept, `settings.json` merged with a backup and without duplicates, invalid JSON left alone, `.gitignore` appended once, dry runs that write nothing, and a second run that changes nothing.
- **Formats.** A small frontmatter checker in the tests reads every generated skill and subagent against the fields Claude Code 2.1.286 reads (`name`, `description`, `argument-hint`, `allowed-tools`, `disable-model-invocation` for skills; `name`, `description`, `tools`, `model` for subagents): every skill is user-only with a description under 60 characters, the agent's description is under 100, and every permission rule has the `Tool(...)` form. Claude Code's own validator agrees on the part it checks: each kit's skills and agent, wrapped in a throwaway plugin, pass `claude plugin validate` (2.1.286, run with a throwaway config folder), which parses their frontmatter as YAML; a deliberately broken copy fails it. That validator does not check what the fields mean.
- **Token budgets as tests.** Each `CLAUDE.md` is under 250 tokens on the richest sample and on awkward ones, and so is the section `--merge` appends, markers included. The tables above are generated and compared with this README by a test.
- **Node 18.** The code uses only Node 18 APIs and no dependencies, and a test scans the source for newer ones. CI runs it on Node 20, 22 and 24; Node 18 is checked only by that scan.

Not verified: loading the generated files in a live Claude Code session (the build session ran only `claude plugin validate`), so how Claude follows `/test` and `/check` and how it uses the subagent is by design, not by observation. The estimator was not compared with Claude's tokenizer. The first CI run passed on Windows, macOS and Linux with Node 20, 22 and 24.

## Files

| Path | What it is |
| --- | --- |
| `bin/claude-starter.mjs` | The command (`claude-starter`) |
| `src/` | The CLI, detection, one module per stack, the template renderer, the plan and apply step, the settings merge, the report and the token estimator (Node 18+, no dependencies) |
| `kits/` | The templates, as plain Markdown and JSON: `kits/<stack>/CLAUDE.md` and `settings.json`, and `kits/_shared/` for the skills and the agent |
| `scripts/` | `token-table.mjs` (builds and checks the tables above) and `samples.mjs` (the sample projects) |
| `test/` | `npm test` |

Related: [claude-code-handover](https://github.com/nrzz/claude-code-handover) keeps your sessions short with a handover file, [claude-code-team-sync](https://github.com/nrzz/claude-code-team-sync) shares sessions and context with your coworkers, and [claude-code-glow](https://github.com/nrzz/claude-code-glow) themes the interface and shows tips that save tokens.

## Contributing

Issues and pull requests are welcome: start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [good first issues](https://github.com/nrzz/claude-code-starter-kits/issues?q=is%3Aopen+label%3A%22good+first+issue%22). Questions go to [Discussions](https://github.com/nrzz/claude-code-starter-kits/discussions); security reports go through [SECURITY.md](SECURITY.md).

## Part of the Claude Code toolkit

Small, dependency-free tools that make Claude Code cheaper, safer and easier to share, all in the [Claude Code toolkit](https://github.com/nrzz/claude-code-toolkit):

- [claude-code-handover](https://github.com/nrzz/claude-code-handover): short sessions with a handover file every new session loads by itself
- [claude-code-team-sync](https://github.com/nrzz/claude-code-team-sync): share sessions, notes and team context with coworkers
- [claude-code-glow](https://github.com/nrzz/claude-code-glow): themes for the whole interface, a status line and a live HUD
- [claude-code-guardrails](https://github.com/nrzz/claude-code-guardrails): safety presets that stop risky commands and edits
- [claude-code-notify](https://github.com/nrzz/claude-code-notify): a ping when Claude needs you or finishes
- [claude-md-doctor](https://github.com/nrzz/claude-md-doctor): what your CLAUDE.md costs every session, and how to slim it
- [claude-cost-guard](https://github.com/nrzz/claude-cost-guard): daily and weekly token budgets with zero-token warnings
- [claude-session-replay](https://github.com/nrzz/claude-session-replay): search past sessions and export one as an HTML replay

## License

MIT
