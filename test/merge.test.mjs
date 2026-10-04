// Existing files: nothing a user has is ever replaced, and merges happen only where they were asked for
// (CLAUDE.md with --merge) or where they are safe (settings.json after a backup, .gitignore by adding lines).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SAMPLES } from "../scripts/samples.mjs";
import { BEGIN, END, mergeBlock } from "../src/plan.mjs";
import { estimateTokens } from "../src/tokens.mjs";
import { project, runMain, snapshot, tree } from "./helpers.mjs";

const GO = SAMPLES.go.files;
const backups = (proj) => tree(proj.dir).filter((f) => /\.claude\/settings\.json\.bak-starter-\d{8}-\d{6}/.test(f));
const count = (text, needle) => text.split(needle).length - 1;

// -------------------------------------------------------------------------------------- CLAUDE.md

test("an existing CLAUDE.md is never touched: the starter goes to CLAUDE.starter.md, with a note on how to combine", () => {
  const mine = "# My notes\r\n\r\nTabs, not spaces.\r\n";
  const proj = project({ ...GO, "CLAUDE.md": mine });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 0, r.err);
    assert.equal(proj.read("CLAUDE.md"), mine, "byte for byte");
    assert.match(proj.read("CLAUDE.starter.md"), /^# my-app\n/);
    assert.match(r.out, /created\s+CLAUDE\.starter\.md/);
    assert.match(r.out, /CLAUDE\.md already exists, so the starter went to CLAUDE\.starter\.md/);
    assert.match(r.out, /copy the lines you want into CLAUDE\.md and delete CLAUDE\.starter\.md/);
    assert.match(r.out, /--merge/);
  } finally { proj.cleanup(); }
});

test("CLAUDE.starter.md costs no tokens in the summary, because Claude Code does not read that name", () => {
  const proj = project({ ...GO, "CLAUDE.md": "# Mine\n" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.match(r.out, /Per session this adds about 36 tokens \(test-runner in the agent list 36\)/);
    assert.doesNotMatch(r.out, /CLAUDE\.md \d+,/);
  } finally { proj.cleanup(); }
});

test("a second run leaves an existing CLAUDE.starter.md alone", () => {
  const proj = project({ ...GO, "CLAUDE.md": "# Mine\n" });
  try {
    runMain(["--dir", proj.dir]);
    fs.writeFileSync(proj.p("CLAUDE.starter.md"), "edited by hand\n");
    const r = runMain(["--dir", proj.dir]);
    assert.equal(proj.read("CLAUDE.starter.md"), "edited by hand\n");
    assert.match(r.out, /skipped\s+CLAUDE\.starter\.md\s+already exists; kept yours/);
  } finally { proj.cleanup(); }
});

test("an empty CLAUDE.md is filled in; so is one holding only blank lines", () => {
  for (const empty of ["", "\n\n  \n"]) {
    const proj = project({ ...GO, "CLAUDE.md": empty });
    try {
      const r = runMain(["--dir", proj.dir]);
      assert.match(proj.read("CLAUDE.md"), /^# my-app\n/);
      assert.ok(!proj.has("CLAUDE.starter.md"));
      assert.match(r.out, /filled in\s+CLAUDE\.md\s+the existing file was empty/);
    } finally { proj.cleanup(); }
  }
});

test("a CLAUDE.md that already is the starter (even with CRLF line endings) is left alone", () => {
  const proj = project(GO);
  try {
    runMain(["--dir", proj.dir]);
    const lf = proj.read("CLAUDE.md");
    fs.writeFileSync(proj.p("CLAUDE.md"), lf.replace(/\n/g, "\r\n"));
    const before = snapshot(proj.dir);
    const r = runMain(["--dir", proj.dir]);
    assert.deepEqual(snapshot(proj.dir), before);
    assert.match(r.out, /skipped\s+CLAUDE\.md\s+already holds this starter/);
    assert.ok(!proj.has("CLAUDE.starter.md"));
  } finally { proj.cleanup(); }
});

test("--merge appends the starter as a marked section, once, and keeps the existing text first", () => {
  const mine = "# Orders API\n\n## Rules\n- Be kind.\n";
  const proj = project({ ...GO, "CLAUDE.md": mine });
  try {
    const r = runMain(["--dir", proj.dir, "--merge"]);
    assert.equal(r.code, 0, r.err);
    const md = proj.read("CLAUDE.md");
    assert.ok(md.startsWith(mine), "the existing text is untouched at the top");
    assert.equal(count(md, BEGIN), 1);
    assert.equal(count(md, END), 1);
    assert.ok(md.indexOf(BEGIN) < md.indexOf("## my-app") && md.indexOf("### Commands") < md.indexOf(END));
    assert.match(md, /### Conventions/, "the starter's headings sit one level deeper");
    assert.doesNotMatch(md.slice(mine.length), /^# /m, "no second top-level title");
    assert.ok(!proj.has("CLAUDE.starter.md"));
    assert.match(r.out, /merged\s+CLAUDE\.md\s+starter section added at the end; about \d+ tokens in every session/);
  } finally { proj.cleanup(); }
});

test("--merge twice, or a plain run after --merge, changes nothing and adds no CLAUDE.starter.md", () => {
  const proj = project({ ...GO, "CLAUDE.md": "# Mine\n" });
  try {
    runMain(["--dir", proj.dir, "--merge"]);
    const once = snapshot(proj.dir);
    const again = runMain(["--dir", proj.dir, "--merge"]);
    assert.deepEqual(snapshot(proj.dir), once);
    assert.match(again.out, /skipped\s+CLAUDE\.md\s+already has the starter section/);
    runMain(["--dir", proj.dir]);
    assert.deepEqual(snapshot(proj.dir), once);
    assert.equal(count(proj.read("CLAUDE.md"), BEGIN), 1);
  } finally { proj.cleanup(); }
});

test("--merge into a file with no final newline still leaves a blank line before the section", () => {
  const proj = project({ ...GO, "CLAUDE.md": "# Mine\nlast line without newline" });
  try {
    runMain(["--dir", proj.dir, "--merge"]);
    assert.match(proj.read("CLAUDE.md"), /^# Mine\nlast line without newline\n\n<!-- claude-starter:begin -->\n## my-app\n/);
    assert.ok(proj.read("CLAUDE.md").endsWith(`${END}\n`));
  } finally { proj.cleanup(); }
});

test("--merge where there is no CLAUDE.md just creates it, with no markers", () => {
  const proj = project(GO);
  try {
    const r = runMain(["--dir", proj.dir, "--merge"]);
    assert.match(r.out, /created\s+CLAUDE\.md/);
    assert.doesNotMatch(proj.read("CLAUDE.md"), /claude-starter:/);
    assert.match(proj.read("CLAUDE.md"), /^# my-app\n/);
  } finally { proj.cleanup(); }
});

test("the merged section stays under the token budget even with its markers, on every sample", () => {
  for (const id of Object.keys(SAMPLES)) {
    const proj = project({ ...SAMPLES[id].files, "CLAUDE.md": "# Mine\n" });
    try {
      runMain(["--dir", proj.dir, "--merge"]);
      const md = proj.read("CLAUDE.md");
      const block = md.slice(md.indexOf(BEGIN));
      assert.ok(estimateTokens(block) < 250, `${id}: the merged section is ${estimateTokens(block)} tokens`);
    } finally { proj.cleanup(); }
  }
});

test("mergeBlock: headings go one level deeper and the markers wrap the text", () => {
  assert.equal(mergeBlock("# T\n\n## A\n- x\n### B\ntext # not a heading\n"), `${BEGIN}\n## T\n\n### A\n- x\n#### B\ntext # not a heading\n${END}\n`);
});

// ------------------------------------------------------------------------------ skills and the agent

test("existing skills are untouched, and the other one is still written", () => {
  const mine = "---\nname: test\ndescription: my own test skill\n---\nRun my way.\n";
  const proj = project({ ...GO, ".claude/skills/test/SKILL.md": mine });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".claude/skills/test/SKILL.md"), mine);
    assert.ok(proj.has(".claude/skills/check/SKILL.md"));
    assert.match(r.out, /skipped\s+\.claude\/skills\/test\/SKILL\.md\s+already exists; kept yours/);
    assert.match(r.out, /created\s+\.claude\/skills\/check\/SKILL\.md/);
  } finally { proj.cleanup(); }
});

test("a skill identical to ours is reported as unchanged, not as someone else's", () => {
  const proj = project(GO);
  try {
    runMain(["--dir", proj.dir]);
    const r = runMain(["--dir", proj.dir]);
    assert.match(r.out, /skipped\s+\.claude\/skills\/test\/SKILL\.md\s+already there, unchanged/);
  } finally { proj.cleanup(); }
});

test("an existing /test command (.claude/commands/test.md) is respected: no skill of the same name is added", () => {
  const proj = project({ ...GO, ".claude/commands/test.md": "Run go test.\n" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.ok(!proj.has(".claude/skills/test/SKILL.md"));
    assert.equal(proj.read(".claude/commands/test.md"), "Run go test.\n");
    assert.match(r.out, /you already have a \/test command \(\.claude\/commands\/test\.md\); kept yours/);
    assert.ok(proj.has(".claude/skills/check/SKILL.md"));
  } finally { proj.cleanup(); }
});

test("an existing test-runner agent is untouched", () => {
  const mine = "---\nname: test-runner\ndescription: mine\n---\nMy prompt.\n";
  const proj = project({ ...GO, ".claude/agents/test-runner.md": mine });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".claude/agents/test-runner.md"), mine);
    assert.match(r.out, /skipped\s+\.claude\/agents\/test-runner\.md\s+already exists; kept yours/);
    assert.match(r.out, /Per session this adds about \d+ tokens \(CLAUDE\.md \d+\)/, "no agent line is counted when none was written");
  } finally { proj.cleanup(); }
});

test("a skill folder without a SKILL.md gets one, and its other files are untouched", () => {
  const proj = project({ ...GO, ".claude/skills/test/helper.sh": "echo hi\n" });
  try {
    runMain(["--dir", proj.dir]);
    assert.ok(proj.has(".claude/skills/test/SKILL.md"));
    assert.equal(proj.read(".claude/skills/test/helper.sh"), "echo hi\n");
  } finally { proj.cleanup(); }
});

// --------------------------------------------------------------------------------------- settings

const ORIGINAL = '{\n  "model": "opus",\n  "permissions": {\n    "allow": ["Bash(ls:*)", "Bash(go test:*)"],\n    "defaultMode": "acceptEdits"\n  },\n  "env": { "A": "1" }\n}\n';

test("settings.json is backed up byte for byte, then merged: your keys stay, rules are added without duplicates", () => {
  const proj = project({ ...GO, ".claude/settings.json": ORIGINAL });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 0, r.err);
    const [backup] = backups(proj);
    assert.equal(backups(proj).length, 1);
    assert.equal(fs.readFileSync(proj.p(backup), "utf8"), ORIGINAL);
    const merged = JSON.parse(proj.read(".claude/settings.json"));
    assert.equal(merged.model, "opus");
    assert.deepEqual(merged.env, { A: "1" });
    assert.equal(merged.permissions.defaultMode, "acceptEdits");
    assert.deepEqual(merged.permissions.allow.slice(0, 2), ["Bash(ls:*)", "Bash(go test:*)"], "your rules first, in your order");
    assert.equal(new Set(merged.permissions.allow).size, merged.permissions.allow.length, "no duplicates");
    assert.equal(merged.permissions.allow.filter((x) => x === "Bash(go test:*)").length, 1);
    assert.ok(merged.permissions.allow.includes("Bash(go build:*)"));
    assert.ok(merged.permissions.deny.includes("Read(./.env)"));
    assert.match(r.out, /merged\s+\.claude\/settings\.json\s+\+\d+ rules added; backup \.claude\/settings\.json\.bak-starter-\d{8}-\d{6}/);
  } finally { proj.cleanup(); }
});

test("the merged settings.json keeps the file's own formatting", () => {
  const four = '{\n    "model": "opus"\n}';
  const proj = project({ ...GO, ".claude/settings.json": four });
  try {
    runMain(["--dir", proj.dir]);
    const text = proj.read(".claude/settings.json");
    assert.match(text, /^\{\n {4}"model": "opus",\n {4}"permissions": \{\n {8}"allow": \[/);
    assert.ok(!text.endsWith("\n"), "no final newline was added where there was none");
  } finally { proj.cleanup(); }
  const crlf = project({ ...GO, ".claude/settings.json": '{\r\n  "model": "opus"\r\n}\r\n' });
  try {
    runMain(["--dir", crlf.dir]);
    const text = crlf.read(".claude/settings.json");
    assert.ok(text.includes("\r\n") && !/[^\r]\n/.test(text), "CRLF throughout");
  } finally { crlf.cleanup(); }
});

test("a second run adds no rules and no second backup", () => {
  const proj = project({ ...GO, ".claude/settings.json": ORIGINAL });
  try {
    runMain(["--dir", proj.dir]);
    const after = snapshot(proj.dir);
    const r = runMain(["--dir", proj.dir]);
    assert.deepEqual(snapshot(proj.dir), after);
    assert.equal(backups(proj).length, 1);
    assert.match(r.out, /skipped\s+\.claude\/settings\.json\s+already has these rules/);
  } finally { proj.cleanup(); }
});

test("an empty settings.json is treated as {}", () => {
  const proj = project({ ...GO, ".claude/settings.json": "" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 0, r.err);
    assert.ok(JSON.parse(proj.read(".claude/settings.json")).permissions.allow.length > 3);
  } finally { proj.cleanup(); }
});

test("settings.json with invalid JSON is left untouched: the snippet is printed and the exit code is 1", () => {
  const broken = '{ "model": "opus", }\n';
  const proj = project({ ...GO, ".claude/settings.json": broken });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 1);
    assert.equal(proj.read(".claude/settings.json"), broken, "byte for byte");
    assert.equal(backups(proj).length, 0, "no backup of a file that was not changed");
    assert.match(r.err, /\.claude\/settings\.json is not valid JSON, so it was left untouched\./);
    assert.match(r.err, /"permissions": \{/);
    assert.match(r.err, /"Bash\(go test:\*\)"/);
    assert.match(r.out, /not done\s+\.claude\/settings\.json/);
    assert.ok(proj.has("CLAUDE.md") && proj.has(".claude/skills/test/SKILL.md"), "everything else is still written");
  } finally { proj.cleanup(); }
});

test("the snippet printed for a settings.json that cannot be merged is valid JSON a person can paste", () => {
  const proj = project({ ...GO, ".claude/settings.json": "nope" });
  try {
    const r = runMain(["--dir", proj.dir]);
    const lines = r.err.split("\n");
    const start = lines.findIndex((l) => /^ {2}\{$/.test(l));
    assert.ok(start >= 0);
    const json = lines.slice(start).map((l) => l.slice(2)).join("\n");
    assert.ok(JSON.parse(json).permissions.deny.length > 3);
  } finally { proj.cleanup(); }
});

test("settings.json that is not an object, or has a malformed permissions section, is left alone with exit 1", () => {
  for (const text of ["[]", '"x"', '{"permissions": "all"}', '{"permissions": {"allow": "Bash(ls)"}}']) {
    const proj = project({ ...GO, ".claude/settings.json": text });
    try {
      const r = runMain(["--dir", proj.dir]);
      assert.equal(r.code, 1, text);
      assert.equal(proj.read(".claude/settings.json"), text);
      assert.equal(backups(proj).length, 0);
    } finally { proj.cleanup(); }
  }
});

test("a dry run with an invalid settings.json says so and exits 1, as the real run would", () => {
  const proj = project({ ...GO, ".claude/settings.json": "{" });
  try {
    const r = runMain(["--dir", proj.dir, "--dry-run"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /cannot do\s+\.claude\/settings\.json/);
    assert.equal(proj.read(".claude/settings.json"), "{");
  } finally { proj.cleanup(); }
});

test("a rule you keep in a different list is left there and reported, never flipped", () => {
  const mine = JSON.stringify({ permissions: { allow: ["Bash(git push --force:*)"], ask: ["Bash(go build:*)"] } });
  const proj = project({ ...SAMPLES.go.files, ".claude/settings.json": mine });
  try {
    const r = runMain(["--dir", proj.dir]);
    const merged = JSON.parse(proj.read(".claude/settings.json")).permissions;
    assert.ok(merged.allow.includes("Bash(git push --force:*)"));
    assert.ok(!merged.deny.includes("Bash(git push --force:*)"), "your allow stays allowed");
    assert.deepEqual(merged.ask, ["Bash(go build:*)"]);
    assert.ok(!merged.allow.includes("Bash(go build:*)"), "your ask stays an ask");
    assert.match(r.out, /kept your rule Bash\(git push --force:\*\) in "allow"; not added to "deny"/);
    assert.match(r.out, /kept your rule Bash\(go build:\*\) in "ask"; not added to "allow"/);
  } finally { proj.cleanup(); }
});

// -------------------------------------------------------------------------------------- .gitignore

test("an existing .gitignore only gets lines added at the end, once", () => {
  const mine = "node_modules/\n*.log\n";
  const proj = project({ ...GO, ".gitignore": mine });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".gitignore"), `${mine}\n# Claude Code: personal files\nCLAUDE.local.md\n.claude/settings.local.json\n`);
    assert.match(r.out, /merged\s+\.gitignore\s+2 entries added at the end, under a comment line/, "the report counts the two entries and mentions the comment, not '2 lines'");
    const again = runMain(["--dir", proj.dir]);
    assert.equal(count(proj.read(".gitignore"), "CLAUDE.local.md"), 1);
    assert.match(again.out, /skipped\s+\.gitignore\s+already ignores both files/);
  } finally { proj.cleanup(); }
});

test(".gitignore without a final newline: the added lines start on their own line", () => {
  const proj = project({ ...GO, ".gitignore": "dist" });
  try {
    runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".gitignore"), "dist\n\n# Claude Code: personal files\nCLAUDE.local.md\n.claude/settings.local.json\n");
  } finally { proj.cleanup(); }
});

test(".gitignore: a line you already have (even with a leading slash, or CRLF endings) is not added again", () => {
  const proj = project({ ...GO, ".gitignore": "/CLAUDE.local.md\r\n.claude/settings.local.json\r\n" });
  try {
    const before = snapshot(proj.dir);
    const r = runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".gitignore"), before[".gitignore"]);
    assert.match(r.out, /skipped\s+\.gitignore\s+already ignores both files/);
  } finally { proj.cleanup(); }
});

test(".gitignore: when one of the two is there, only the other is added, and the comment is not repeated", () => {
  const proj = project({ ...GO, ".gitignore": "# Claude Code: personal files\nCLAUDE.local.md\n" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".gitignore"), "# Claude Code: personal files\nCLAUDE.local.md\n\n.claude/settings.local.json\n");
    assert.match(r.out, /merged\s+\.gitignore\s+1 entry added at the end(?!, under)/, "no comment line is added this time, so the report does not mention one");
  } finally { proj.cleanup(); }
});

test("an empty .gitignore just gets the lines", () => {
  const proj = project({ ...GO, ".gitignore": "" });
  try {
    runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".gitignore"), "# Claude Code: personal files\nCLAUDE.local.md\n.claude/settings.local.json\n");
  } finally { proj.cleanup(); }
});

// ------------------------------------------------------------------------------------ when it fails

test("when something cannot be written it is reported, exit is 1, and the other files are still written", () => {
  const proj = project({ ...GO, ".claude": "this is a file, not a folder" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 1);
    assert.match(r.out, /failed\s+\.claude\/settings\.json/);
    assert.ok(proj.has("CLAUDE.md"), "CLAUDE.md does not depend on .claude/");
    assert.equal(proj.read(".claude"), "this is a file, not a folder");
  } finally { proj.cleanup(); }
});

// --------------------------------------------------------------------------------- line endings

test("--merge into a CRLF CLAUDE.md appends with CRLF, so the file keeps one kind of line ending", () => {
  const proj = project({ ...GO, "CLAUDE.md": "# Mine\r\n\r\nrule\r\n" });
  try {
    runMain(["--dir", proj.dir, "--merge"]);
    const md = proj.read("CLAUDE.md");
    assert.ok(md.startsWith("# Mine\r\n\r\nrule\r\n"), "their text is untouched");
    assert.ok(!/[^\r]\n/.test(md), "no bare LF anywhere");
    assert.equal(count(md, BEGIN), 1);
    const again = runMain(["--dir", proj.dir, "--merge"]);
    assert.match(again.out, /already has the starter section/);
  } finally { proj.cleanup(); }
});

test("a CRLF .gitignore gets its lines added with CRLF", () => {
  const proj = project({ ...GO, ".gitignore": "dist/\r\n" });
  try {
    runMain(["--dir", proj.dir]);
    const text = proj.read(".gitignore");
    assert.equal(text, "dist/\r\n\r\n# Claude Code: personal files\r\nCLAUDE.local.md\r\n.claude/settings.local.json\r\n");
  } finally { proj.cleanup(); }
});

// ------------------------------------------------------------------------------ preview wording

test("a preview speaks in the conditional: would go, would be added", () => {
  const proj = project({ ...GO, "CLAUDE.md": "# Mine\n", ".claude/settings.json": "{}", ".gitignore": "dist/\n" });
  try {
    const r = runMain(["--dir", proj.dir, "--dry-run"]);
    assert.match(r.out, /CLAUDE\.md already exists, so the starter would go to CLAUDE\.starter\.md/);
    assert.match(r.out, /would merge\s+\.claude\/settings\.json\s+\+\d+ rules would be added/);
    assert.match(r.out, /would merge\s+\.gitignore\s+2 entries would be added at the end, under a comment line/);
    assert.doesNotMatch(r.out, /Review the files, then commit/);
    const merged = runMain(["--dir", proj.dir, "--dry-run", "--merge"]);
    assert.match(merged.out, /would merge\s+CLAUDE\.md\s+starter section would be added at the end/);
  } finally { proj.cleanup(); }
});

// ------------------------------------------------------------------------- merged by hand earlier

test("a CLAUDE.md that already has the starter's token habits (merged by hand) is left alone, with or without --merge", () => {
  const mine = "# Mine\n\n## Token habits\n- Use the test-runner subagent for long builds and test logs.\n";
  const proj = project({ ...GO, "CLAUDE.md": mine });
  try {
    for (const args of [[], ["--merge"]]) {
      const r = runMain(["--dir", proj.dir, ...args]);
      assert.equal(proj.read("CLAUDE.md"), mine);
      assert.ok(!proj.has("CLAUDE.starter.md"), `no starter file written ${args.join(" ")}`);
      assert.match(r.out, /skipped\s+CLAUDE\.md\s+already has the starter's token habits/);
    }
  } finally { proj.cleanup(); }
});

// ------------------------------------------------------------------------------------- symlinks

test("a settings.json that is a symbolic link stays a link: the file it points to is the one merged", (t) => {
  const proj = project({ ...GO, "shared/settings.json": '{"model":"opus"}\n' });
  try {
    fs.mkdirSync(proj.p(".claude"), { recursive: true });
    try {
      fs.symlinkSync(proj.p("shared/settings.json"), proj.p(".claude/settings.json"), "file");
    } catch {
      t.skip("this system does not allow creating symbolic links here");
      return;
    }
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 0, r.err);
    assert.ok(fs.lstatSync(proj.p(".claude/settings.json")).isSymbolicLink(), "still a link");
    const merged = JSON.parse(proj.read("shared/settings.json"));
    assert.equal(merged.model, "opus");
    assert.ok(merged.permissions.allow.length > 3, "the target was merged");
  } finally { proj.cleanup(); }
});
