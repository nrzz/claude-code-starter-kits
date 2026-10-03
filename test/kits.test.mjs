// The kits themselves: every template rendered for every stack, on the richest sample project and on
// awkward ones, checked for token budgets, frontmatter and permission rules.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SAMPLES } from "../scripts/samples.mjs";
import { KITS_DIR } from "../src/kit.mjs";
import { LAST_HABIT } from "../src/plan.mjs";
import { STACK_IDS } from "../src/stacks/index.mjs";
import { estimateTokens } from "../src/tokens.mjs";
import { parseFrontmatter } from "../src/frontmatter.mjs";
import { checkAgent, checkRule, checkSkill, renderProject } from "./helpers.mjs";

const BUDGET = 250;
const HABITS = [
  "Read files by line range when they are large.",
  "Run one test file before the whole suite.",
  "Use the test-runner subagent for long builds and test logs.",
];
const sample = (id) => renderProject(SAMPLES[id].files);
const SAMPLE_KITS = Object.fromEntries(STACK_IDS.map((id) => [id, sample(id)]));

// The commands each sample has, so the budget tests below run on a CLAUDE.md with every line present.
const RICH = {
  dotnet: ["build", "test", "testOne", "lint", "format"],
  node: ["build", "typecheck", "test", "testOne", "lint", "format"],
  python: ["test", "testOne", "lint", "format"],
  go: ["build", "test", "testOne", "lint", "format"],
  flutter: ["build", "test", "testOne", "lint", "format"],
  java: ["build", "test", "testOne", "lint", "format"],
};

const conventions = (md) => {
  const body = /## Conventions\n([\s\S]*?)(\n## |$)/.exec(md)?.[1] ?? "";
  return body.split("\n").filter((l) => l.startsWith("- "));
};

test("every stack has a CLAUDE.md and a settings.json template, and the shared files exist", () => {
  for (const id of STACK_IDS) {
    for (const f of ["CLAUDE.md", "settings.json"]) assert.ok(fs.existsSync(path.join(KITS_DIR, id, f)), `${id}/${f}`);
  }
  for (const f of ["settings.json", "skills/test/SKILL.md", "skills/check/SKILL.md", "agents/test-runner.md"]) {
    assert.ok(fs.existsSync(path.join(KITS_DIR, "_shared", f)), `_shared/${f}`);
  }
});

test("template files are plain: LF endings, no tabs, no trailing spaces, one final newline", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const file of walk(KITS_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    const name = path.relative(KITS_DIR, file);
    assert.ok(!text.includes("\r"), `${name}: CR`);
    assert.ok(!text.includes("\t"), `${name}: tab`);
    assert.ok(!/[ ]+\n/.test(text), `${name}: trailing space`);
    assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"), `${name}: final newline`);
  }
});

for (const id of STACK_IDS) {
  test(`${id}: the sample project has every command the budget test assumes`, () => {
    const { facts } = SAMPLE_KITS[id];
    for (const key of RICH[id]) assert.ok(facts.vars[key], `${id} sample: ${key}`);
  });

  test(`${id}: CLAUDE.md is under ${BUDGET} tokens on the richest sample`, () => {
    const tokens = estimateTokens(SAMPLE_KITS[id].kit.claudeMd);
    assert.ok(tokens < BUDGET, `${id} CLAUDE.md is ${tokens} tokens`);
    assert.ok(tokens > 100, `${id} CLAUDE.md is suspiciously small: ${tokens}`);
  });

  test(`${id}: CLAUDE.md has the real commands, 4 to 6 conventions and the three token habits`, () => {
    const { kit, facts } = SAMPLE_KITS[id];
    const md = kit.claudeMd;
    assert.match(md, new RegExp(`^# ${facts.vars.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`), "title is the project name");
    for (const key of RICH[id].filter((k) => k !== "lint" || id !== "dotnet")) {
      if (key === "lint" && !md.includes(facts.vars.lint)) continue; // lint and format share a line
      assert.ok(md.includes(facts.vars[key]), `${id}: ${key} command "${facts.vars[key]}" is in CLAUDE.md`);
    }
    for (const habit of HABITS) assert.ok(md.includes(`- ${habit}\n`), `${id}: habit "${habit}"`);
    const n = conventions(md).length;
    assert.ok(n >= 4 && n <= 6, `${id}: ${n} conventions`);
    assert.doesNotMatch(md, /\{\{|\}\}/);
  });
}

// The barest project of each stack: only the marker file, so the optional lines all drop out.
const BARE = {
  dotnet: { "A.csproj": '<Project Sdk="Microsoft.NET.Sdk"></Project>' },
  node: { "package.json": "{}" },
  python: { "requirements.txt": "" },
  go: { "go.mod": "module x\n" },
  flutter: { "pubspec.yaml": "name: x\n" },
  java: { "pom.xml": "<project/>" },
};

for (const id of STACK_IDS) {
  test(`${id}: a bare project still gets a complete CLAUDE.md, with no empty bullets or headings`, () => {
    const { kit } = renderProject(BARE[id]);
    const md = kit.claudeMd;
    assert.ok(estimateTokens(md) < BUDGET);
    const n = conventions(md).length;
    assert.ok(n >= 4 && n <= 6, `${id}: ${n} conventions in a bare project`);
    for (const habit of HABITS) assert.ok(md.includes(habit));
    assert.doesNotMatch(md, /: `\s*`/, "no empty command");
    assert.doesNotMatch(md, /^- *$/m, "no empty bullet");
    assert.doesNotMatch(md, /^(#{2,3}) .*\n+\1 /m, "no section left empty before the next one");
    assert.match(md, /## Conventions/);
    assert.match(md, /## Token habits/);
  });
}

test("budget: node in every package manager, TypeScript with Next.js and an app folder, every script, in a nested folder, with a long name", () => {
  const scripts = { dev: "d", build: "b", test: "t", lint: "l", format: "f", typecheck: "tc", "test:unit": "u" };
  for (const lock of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]) {
    const { kit } = renderProject({
      "web/package.json": JSON.stringify({ name: "@contoso-platform/ordering-frontend", scripts, dependencies: { next: "15" }, devDependencies: { typescript: "5" } }),
      [`web/${lock}`]: "",
      "web/app/page.tsx": "",
    });
    const tokens = estimateTokens(kit.claudeMd);
    assert.ok(tokens < BUDGET, `${lock}: ${tokens} tokens`);
    assert.match(kit.claudeMd, /Commands run in `web\/`\./);
  }
});

test("budget: dotnet with a long solution name, at the root and in a sub-folder", () => {
  const csproj = '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>';
  const root = renderProject({ "Contoso.Ordering.Platform.sln": "", "Api/Api.csproj": csproj });
  assert.ok(estimateTokens(root.kit.claudeMd) < BUDGET, `root: ${estimateTokens(root.kit.claudeMd)} tokens`);
  const nested = renderProject({ "src/Contoso.Ordering.Platform.sln": "", "src/Api/Api.csproj": csproj });
  assert.ok(estimateTokens(nested.kit.claudeMd) < BUDGET, `nested: ${estimateTokens(nested.kit.claudeMd)} tokens`);
  assert.match(nested.kit.claudeMd, /dotnet build src\/Contoso\.Ordering\.Platform\.sln/);
});

test("budget: python with poetry and a long project name, java with Spring Boot and Spotless in a sub-folder", () => {
  const py = renderProject({ "pyproject.toml": '[tool.poetry]\nname = "contoso-ordering-platform-api-service"\n[tool.ruff]\n', "poetry.lock": "" });
  assert.ok(estimateTokens(py.kit.claudeMd) < BUDGET);
  const java = renderProject({ "services/orders/pom.xml": "<parent><artifactId>spring-boot-starter-parent</artifactId></parent><artifactId>contoso-ordering-service</artifactId><plugin>spotless-maven-plugin</plugin>", "services/orders/mvnw": "" });
  assert.ok(estimateTokens(java.kit.claudeMd) < BUDGET);
});

test("skills: both are user-only, short and well formed on every stack, rich or bare", () => {
  const kits = [...Object.values(SAMPLE_KITS).map((k) => k.kit), ...Object.values(BARE).map((f) => renderProject(f).kit)];
  assert.equal(kits.length, 12);
  for (const kit of kits) {
    for (const name of ["test", "check"]) {
      const f = kit.files.find((x) => x.path === `.claude/skills/${name}/SKILL.md`);
      assert.ok(f, `${name} skill is written`);
      assert.deepEqual(checkSkill(f.text, name), [], `${name} skill`);
    }
  }
});

test("skills: /test takes an optional filter and /check takes nothing", () => {
  const { kit } = SAMPLE_KITS.node;
  const test_ = parseFrontmatter(kit.files.find((f) => f.path.includes("skills/test")).text);
  const check = parseFrontmatter(kit.files.find((f) => f.path.includes("skills/check")).text);
  assert.equal(test_.data["argument-hint"], "[file or filter]");
  assert.match(test_.body, /\$ARGUMENTS/);
  assert.equal(check.data["argument-hint"], undefined);
  for (const body of [test_.body, check.body]) {
    assert.match(body, /test-runner subagent/);
    assert.match(body, /at most 10 lines/);
    assert.match(body, /file:line and the first error line/);
  }
});

test("skills: /check runs build, typecheck, lint and test in that order, only the ones the project has", () => {
  const body = parseFrontmatter(SAMPLE_KITS.node.kit.files.find((f) => f.path.includes("skills/check")).text).body;
  const order = ["pnpm run build", "pnpm run typecheck", "pnpm run lint", "pnpm run test"].map((c) => body.indexOf(`\`${c}\``));
  assert.ok(order.every((i) => i >= 0) && [...order].sort((a, b) => a - b).join() === order.join(), "in order");
  const bare = parseFrontmatter(renderProject({ "package.json": JSON.stringify({ scripts: { test: "t" } }) }).kit.files.find((f) => f.path.includes("skills/check")).text);
  assert.doesNotMatch(bare.body, /lint|build|typecheck/);
  assert.match(bare.body, /npm run test/);
});

test("skills: with no test command at all there is no allowed-tools line, and the file is still valid", () => {
  const { kit } = renderProject({ "package.json": "{}" });
  const f = kit.files.find((x) => x.path.includes("skills/test"));
  assert.equal(parseFrontmatter(f.text).data["allowed-tools"], undefined);
  assert.deepEqual(checkSkill(f.text, "test"), []);
});

test("skills: the allowed-tools line lists exactly the project's commands", () => {
  const data = (id, name) => parseFrontmatter(SAMPLE_KITS[id].kit.files.find((f) => f.path.includes(`skills/${name}`)).text).data;
  assert.equal(data("dotnet", "test")["allowed-tools"], "Bash(dotnet test:*)");
  assert.equal(data("dotnet", "check")["allowed-tools"], "Bash(dotnet build:*), Bash(dotnet format:*), Bash(dotnet test:*)");
  assert.equal(data("go", "check")["allowed-tools"], "Bash(go build:*), Bash(golangci-lint run:*), Bash(go test:*)");
  assert.equal(data("python", "check")["allowed-tools"], "Bash(uv run ruff check:*), Bash(uv run pytest:*)");
  assert.equal(data("java", "test")["allowed-tools"], "Bash(./mvnw test:*)");
});

test("agent: a haiku test-runner with four tools and a description under 100 characters, on every stack", () => {
  for (const [id, { kit }] of Object.entries(SAMPLE_KITS)) {
    const f = kit.files.find((x) => x.path === ".claude/agents/test-runner.md");
    assert.deepEqual(checkAgent(f.text, "test-runner"), [], id);
    const { data, body } = parseFrontmatter(f.text);
    assert.equal(data.model, "haiku");
    assert.equal(data.tools, "Bash, Read, Grep, Glob");
    assert.ok(data.description.length < 100, `${id}: ${data.description.length} chars`);
    assert.match(body, /at most 15 lines/);
    assert.match(body, /file:line and the first error line/);
    assert.match(body, /Never paste logs/);
  }
});

test("agent: the always-in-context line stays small, and the prompt knows the project's commands", () => {
  const { kit, facts } = SAMPLE_KITS.go;
  assert.ok(kit.agent.tokens <= 50, `${kit.agent.tokens} tokens`);
  assert.equal(kit.agent.listing, "- test-runner: Runs builds and tests and returns only the failures; use for long logs (Tools: Bash, Read, Grep, Glob)");
  const body = kit.files.find((f) => f.path.includes("agents/")).text;
  for (const key of ["build", "lint", "test", "testOne"]) assert.ok(body.includes(facts.vars[key]), key);
});

test("when used: a skill body is under 130 tokens and the agent prompt under 200", () => {
  for (const [id, { kit }] of Object.entries(SAMPLE_KITS)) {
    for (const f of kit.files) {
      const body = parseFrontmatter(f.text).body;
      const limit = f.path.includes("agents/") ? 200 : 130;
      assert.ok(estimateTokens(body) < limit, `${id} ${f.path}: ${estimateTokens(body)} tokens`);
    }
  }
});

test("settings: every allow rule is an exact prefix, never an interpreter, a launcher or a wildcard", () => {
  const variants = [...Object.values(SAMPLE_KITS).map((k) => k.kit), ...Object.values(BARE).map((f) => renderProject(f).kit)];
  for (const lock of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]) {
    variants.push(renderProject({ "package.json": JSON.stringify({ scripts: { test: "t", lint: "l", build: "b", "test:unit": "u" } }), [lock]: "" }).kit);
  }
  for (const kit of variants) {
    assert.ok(kit.settings.permissions.allow.length >= 3);
    for (const rule of kit.settings.permissions.allow) assert.deepEqual(checkRule(rule), [], rule);
    for (const rule of kit.settings.permissions.deny) assert.match(rule, /^(Bash|Read)\(.+\)$/, `deny rule shape: ${rule}`);
  }
});

test("settings: the rule checker itself catches what it is meant to catch", () => {
  for (const bad of ["Bash(node *)", "Bash(python3 script.py:*)", "Bash(bash -c:*)", "Bash(npx:*)", "Bash(find . -exec:*)", "Bash(gh api:*)",
    "Bash(git fetch --upload-pack:*)", "Bash(npm run *:*)", "Bash(*)", "Bash(:*)", "npm test"]) {
    assert.ok(checkRule(bad).length > 0, bad);
  }
  for (const good of ["Bash(npm run test:*)", "Bash(git status)", "Bash(./mvnw spotless:check:*)", "Bash(dotnet test:*)"]) assert.deepEqual(checkRule(good), [], good);
});

test("settings: the git reads and the secrets are covered for every stack", () => {
  for (const [id, { kit }] of Object.entries(SAMPLE_KITS)) {
    const { allow, deny } = kit.settings.permissions;
    for (const r of ["Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]) assert.ok(allow.includes(r), `${id}: ${r}`);
    for (const r of ["Read(./.env)", "Read(./.env.*)", "Read(./**/*.pem)", "Bash(git push --force:*)"]) assert.ok(deny.includes(r), `${id}: ${r}`);
  }
});

test("settings: the build, test and lint commands of the project are allowed (the spec's examples)", () => {
  const rules = (id) => SAMPLE_KITS[id].kit.settings.permissions.allow;
  assert.ok(rules("dotnet").includes("Bash(dotnet build:*)") && rules("dotnet").includes("Bash(dotnet test:*)"));
  const npm = renderProject({ "package.json": JSON.stringify({ scripts: { test: "t", lint: "l" } }) }).kit.settings.permissions.allow;
  assert.ok(npm.includes("Bash(npm run test:*)") && npm.includes("Bash(npm run lint:*)"));
  assert.ok(rules("go").includes("Bash(go test:*)") && rules("go").includes("Bash(go build:*)"));
  assert.ok(rules("flutter").includes("Bash(flutter test:*)") && rules("flutter").includes("Bash(flutter analyze:*)"));
  assert.ok(rules("python").includes("Bash(uv run pytest:*)"));
  assert.ok(rules("java").includes("Bash(./mvnw test:*)"));
});

test("settings: each stack denies its publishing commands", () => {
  const deny = (id) => SAMPLE_KITS[id].kit.settings.permissions.deny;
  assert.ok(deny("node").includes("Bash(npm publish:*)"));
  assert.ok(deny("dotnet").includes("Bash(dotnet nuget push:*)"));
  assert.ok(deny("python").includes("Bash(twine upload:*)"));
  assert.ok(deny("flutter").includes("Bash(flutter pub publish:*)"));
  assert.ok(deny("java").includes("Bash(mvn deploy:*)"));
  assert.ok(deny("go").includes("Bash(goreleaser release:*)"));
});

test("settings: no rule is in both lists, none is listed twice, and only permissions is set", () => {
  for (const [id, { kit }] of Object.entries(SAMPLE_KITS)) {
    const { allow, deny } = kit.settings.permissions;
    assert.equal(new Set(allow).size, allow.length, `${id}: duplicate allow`);
    assert.equal(new Set(deny).size, deny.length, `${id}: duplicate deny`);
    for (const r of allow) assert.ok(!deny.includes(r), `${id}: ${r} is in both lists`);
    assert.deepEqual(Object.keys(kit.settings), ["permissions"]);
    assert.deepEqual(Object.keys(kit.settings.permissions), ["allow", "deny"]);
  }
});

test("settings: node allows the project's own scripts with the project's package manager", () => {
  const rules = (lock) => renderProject({ "package.json": JSON.stringify({ scripts: { test: "t", build: "b" } }), [lock]: "" }).kit.settings.permissions.allow;
  assert.ok(rules("yarn.lock").includes("Bash(yarn run test:*)") && rules("yarn.lock").includes("Bash(yarn test:*)"));
  assert.ok(rules("pnpm-lock.yaml").includes("Bash(pnpm run build:*)"));
  assert.ok(!rules("bun.lock").includes("Bash(npm run test:*)"));
});

test("settings: a bare node project allows no scripts, only the git reads", () => {
  const allow = renderProject({ "package.json": "{}" }).kit.settings.permissions.allow;
  assert.deepEqual(allow, ["Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)"]);
});

test("the last token habit is the one a hand-merged CLAUDE.md is recognised by, in every kit", () => {
  for (const id of STACK_IDS) {
    const lines = SAMPLE_KITS[id].kit.claudeMd.trimEnd().split("\n");
    assert.equal(lines[lines.length - 1], `- ${LAST_HABIT}`, id);
  }
  assert.equal(LAST_HABIT, HABITS[2]);
});
