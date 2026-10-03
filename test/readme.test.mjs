// The README: its structure follows the family template, the token tables are the ones the templates produce,
// and what it says about the kits matches the kits.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SAMPLES } from "../scripts/samples.mjs";
import { STACKS } from "../src/stacks/index.mjs";
import { buildTables, currentTables, measureAll, withTables } from "../scripts/token-table.mjs";
import { ROOT, renderProject } from "./helpers.mjs";

const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8").replace(/\r\n/g, "\n");
const headings = readme.split("\n").filter((l) => /^#{1,2} /.test(l));

test("README: the title, then the sections of the family template in order", () => {
  assert.deepEqual(headings, [
    "# Claude Code starter kits",
    "## What it costs in tokens",
    "## Use",
    "## What each kit contains",
    "## Merging with what you have",
    "## How it works",
    "## What was verified, and how",
    "## Files",
    "## License",
  ]);
});

test("README: the CI badge sits under the title and links to the workflow", () => {
  const badge = "[![test](https://github.com/nrzz/claude-code-starter-kits/actions/workflows/test.yml/badge.svg)](https://github.com/nrzz/claude-code-starter-kits/actions/workflows/test.yml)";
  assert.ok(readme.startsWith(`# Claude Code starter kits\n\n${badge}\n\n`));
});

test("README: a two-sentence intro follows the badge", () => {
  const intro = readme.split("\n\n")[2];
  const sentences = intro.split(/(?<=\.)\s+(?=[A-Z])/);
  assert.equal(sentences.length, 2, intro);
});

test("README: the token tables are exactly what the templates produce (run `node scripts/token-table.mjs --write` to refresh)", () => {
  assert.equal(currentTables(readme), buildTables());
});

test("README: the table has a row per stack, with the real numbers", () => {
  const rows = measureAll();
  assert.equal(rows.length, STACKS.length);
  for (const r of rows) {
    assert.ok(readme.includes(`| ${r.label} | ${r.claudeMd} | ${r.agentList} | **${r.perSession}** | 0 |`), `${r.label} row`);
    assert.ok(r.claudeMd < 250, `${r.label} CLAUDE.md ${r.claudeMd}`);
  }
});

test("README: withTables replaces only what is between the markers", () => {
  const out = withTables("before\n<!-- token-table:start -->\nold\n<!-- token-table:end -->\nafter\n", "NEW");
  assert.equal(out, "before\n<!-- token-table:start -->\nNEW\n<!-- token-table:end -->\nafter\n");
  assert.throws(() => withTables("no markers", "x"), /needs <!-- token-table:start -->/);
});

test("README: the Use section has the exact npx commands", () => {
  assert.ok(readme.includes("npx -y github:nrzz/claude-code-starter-kits --dry-run"));
  assert.ok(/```text\n[^`]*npx -y github:nrzz\/claude-code-starter-kits\n/.test(readme));
});

test("README: every option and every stack is documented", () => {
  for (const opt of ["--dir <path>", "--dry-run", "--print", "--merge", "--list", "--help", "--version"]) assert.ok(readme.includes(opt), opt);
  for (const s of STACKS) {
    assert.ok(readme.includes(`\`${s.id}\``), `${s.id} is named`);
    assert.ok(readme.includes(`| ${s.label} |`), `${s.label} has a row`);
  }
});

test("README: the files and names it promises are the ones written", () => {
  for (const f of ["CLAUDE.starter.md", "settings.json.bak-starter-<YYYYMMDD-HHMMSS>", "<!-- claude-starter:begin -->", "<!-- claude-starter:end -->", ".claude/agents/test-runner.md",
    ".claude/skills/test/SKILL.md", ".claude/skills/check/SKILL.md", "CLAUDE.local.md", ".claude/settings.local.json"]) assert.ok(readme.includes(f), f);
});

test("README: the 'Files' table lists paths that exist", () => {
  const files = readme.slice(readme.indexOf("## Files"));
  for (const m of files.matchAll(/^\| `([^`]+)` \|/gm)) {
    const first = m[1].split(",")[0].trim();
    assert.ok(fs.existsSync(path.join(ROOT, first.replace(/\/$/, ""))), first);
  }
});

test("README: the agent description length it states is the real one", () => {
  const { kit } = renderProject(SAMPLES.go.files);
  assert.match(readme, new RegExp(`Its description is ${kit.agent.description.length} characters\\.`));
});

test("README: the publishing commands, rules and secrets it names are in the kits' deny lists", () => {
  const denies = Object.values(SAMPLES).flatMap((s) => renderProject(s.files).kit.settings.permissions.deny);
  for (const rule of ["Read(./.env)", "Read(./.env.*)", "Read(./**/*.pem)", "Read(./secrets/**)", "Bash(git push --force:*)", "Bash(git push -f:*)", "Bash(dotnet nuget push:*)",
    "Bash(npm publish:*)", "Bash(twine upload:*)", "Bash(goreleaser release:*)", "Bash(flutter pub publish:*)", "Bash(mvn deploy:*)", "Bash(./gradlew publish:*)"]) {
    assert.ok(denies.includes(rule), `${rule} is denied`);
    const bare = rule.replace(/^Bash\(|:\*\)$|\)$/g, "").replace(/^Read\(/, "");
    assert.ok(readme.includes(bare.split(" ").slice(0, 2).join(" ")) || readme.includes(bare), `README mentions ${bare}`);
  }
});

test("README: the token budget it states is the one enforced", async () => {
  const { CLAUDE_MD_BUDGET } = await import("../src/tokens.mjs");
  assert.equal(CLAUDE_MD_BUDGET, 250);
  assert.match(readme, /under 250 tokens for every stack/);
  assert.match(readme, /ceil\(length \/ 4\)/);
  assert.match(readme, /ceil\(length \/ 3\)/);
});

test("README: plain prose, no emojis and no long dashes", () => {
  assert.doesNotMatch(readme, /\p{Extended_Pictographic}/u);
  assert.ok(!readme.includes(String.fromCharCode(0x2014)), "em dash (U+2014)");
  assert.ok(!readme.includes(String.fromCharCode(0x2013)), "en dash (U+2013)");
  assert.doesNotMatch(readme, /[^\x00-\x7F]/, "the README is plain ASCII");
});

test("README: ends with the license section and the related repositories", () => {
  assert.ok(readme.trimEnd().endsWith("## License\n\nMIT"));
  for (const r of ["claude-code-handover", "claude-code-team-sync", "claude-code-glow"]) assert.ok(readme.includes(`https://github.com/nrzz/${r}`), r);
});
