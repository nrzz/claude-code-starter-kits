// Fresh scaffolds, previews, idempotency and where the files go.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SAMPLES } from "../scripts/samples.mjs";
import { STACK_IDS } from "../src/stacks/index.mjs";
import { estimateTokens } from "../src/tokens.mjs";
import { checkAgent, checkSkill, project, rmrf, runMain, snapshot, tmp, tree } from "./helpers.mjs";

const KIT_FILES = [".claude/agents/test-runner.md", ".claude/settings.json", ".claude/skills/check/SKILL.md", ".claude/skills/test/SKILL.md", ".gitignore", "CLAUDE.md"];

for (const id of STACK_IDS) {
  test(`${id}: a fresh run writes the six kit files and nothing else`, () => {
    const proj = project(SAMPLES[id].files);
    try {
      const before = tree(proj.dir);
      const r = runMain(["--dir", proj.dir]);
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(tree(proj.dir), [...before, ...KIT_FILES].sort());
      assert.match(r.out, /created\s+CLAUDE\.md/);
      assert.match(r.out, new RegExp(`${id === "dotnet" ? "\\.NET" : id === "node" ? "Node\\.js" : id[0].toUpperCase() + id.slice(1)}: detected from`));
    } finally { proj.cleanup(); }
  });

  test(`${id}: every written file is well formed, and the summary's token cost matches the files`, () => {
    const proj = project(SAMPLES[id].files);
    try {
      const r = runMain(["--dir", proj.dir]);
      assert.equal(r.code, 0);
      assert.deepEqual(checkSkill(proj.read(".claude/skills/test/SKILL.md"), "test"), []);
      assert.deepEqual(checkSkill(proj.read(".claude/skills/check/SKILL.md"), "check"), []);
      assert.deepEqual(checkAgent(proj.read(".claude/agents/test-runner.md"), "test-runner"), []);
      const settings = JSON.parse(proj.read(".claude/settings.json"));
      assert.deepEqual(Object.keys(settings), ["permissions"]);
      const md = estimateTokens(proj.read("CLAUDE.md"));
      assert.ok(md < 250);
      const total = /Per session this adds about (\d+) tokens \(CLAUDE\.md (\d+), test-runner in the agent list (\d+)\)/.exec(r.out);
      assert.ok(total, r.out);
      assert.equal(Number(total[2]), md, "CLAUDE.md figure is the file's estimate");
      assert.equal(Number(total[1]), Number(total[2]) + Number(total[3]));
    } finally { proj.cleanup(); }
  });
}

test("the .gitignore gets the two personal files, with a comment, and nothing else", () => {
  const proj = project(SAMPLES.go.files);
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".gitignore"), "# Claude Code: personal files\nCLAUDE.local.md\n.claude/settings.local.json\n");
    assert.match(r.out, /created\s+\.gitignore\s+2 entries, under a comment line\n/, "the report says two entries under a comment, not two lines (the file has three)");
  } finally { proj.cleanup(); }
});

test("the project's real commands reach CLAUDE.md, the skills and the agent", () => {
  const proj = project(SAMPLES.node.files);
  try {
    runMain(["--dir", proj.dir]);
    const md = proj.read("CLAUDE.md");
    for (const c of ["pnpm run build", "pnpm run typecheck", "pnpm run test <file>", "pnpm run lint", "pnpm run format"]) assert.ok(md.includes(c), c);
    assert.match(proj.read(".claude/skills/check/SKILL.md"), /pnpm run lint/);
    assert.match(proj.read(".claude/agents/test-runner.md"), /pnpm run test/);
    assert.match(md, /Next\.js/);
    assert.match(md, /TypeScript/);
  } finally { proj.cleanup(); }
});

test("a dry run writes nothing, says 'would', and lists every file", () => {
  const proj = project(SAMPLES.python.files);
  try {
    const before = snapshot(proj.dir);
    const r = runMain(["--dir", proj.dir, "--dry-run"]);
    assert.equal(r.code, 0);
    assert.deepEqual(snapshot(proj.dir), before);
    assert.match(r.out, /preview: nothing is written/);
    for (const f of KIT_FILES) assert.ok(r.out.includes(f), f);
    assert.equal((r.out.match(/would create/g) || []).length, 6);
    assert.match(r.out, /Per session this would add about \d+ tokens/);
    assert.doesNotMatch(r.out, /\bcreated\b/);
  } finally { proj.cleanup(); }
});

test("a dry run against existing files shows the merges and writes nothing, not even a backup", () => {
  const proj = project({
    ...SAMPLES.go.files,
    "CLAUDE.md": "# Mine\n",
    ".claude/settings.json": '{"model":"opus"}\n',
    ".gitignore": "bin/\n",
  });
  try {
    const before = snapshot(proj.dir);
    const r = runMain(["--dir", proj.dir, "--dry-run", "--merge"]);
    assert.equal(r.code, 0);
    assert.deepEqual(snapshot(proj.dir), before);
    assert.match(r.out, /would merge\s+CLAUDE\.md/);
    assert.match(r.out, /would merge\s+\.claude\/settings\.json/);
    assert.match(r.out, /would merge\s+\.gitignore/);
    assert.match(r.out, /\.bak-starter-<date>-<time>/);
  } finally { proj.cleanup(); }
});

test("--print shows the content of every file, writes nothing, and is a preview", () => {
  const proj = project(SAMPLES.flutter.files);
  try {
    const before = snapshot(proj.dir);
    const r = runMain(["--dir", proj.dir, "--print"]);
    assert.equal(r.code, 0);
    assert.deepEqual(snapshot(proj.dir), before);
    for (const f of KIT_FILES) assert.ok(r.out.includes(`----- ${f} -----`), f);
    assert.match(r.out, /# my_app\n/);
    assert.match(r.out, /"permissions"/);
    assert.match(r.out, /name: test-runner/);
    assert.match(r.out, /preview: nothing is written/);
  } finally { proj.cleanup(); }
});

test("--print of a merge shows the rules that would be added", () => {
  const proj = project({ ...SAMPLES.go.files, ".claude/settings.json": '{"permissions":{"allow":["Bash(ls:*)"]}}' });
  try {
    const r = runMain(["--dir", proj.dir, "--print"]);
    assert.match(r.out, /----- \.claude\/settings\.json \(rules added\) -----/);
    assert.match(r.out, /"Bash\(go test:\*\)"/);
    assert.doesNotMatch(r.out, /"Bash\(ls:\*\)"/, "their own rule is not in what is added");
    assert.equal(proj.read(".claude/settings.json"), '{"permissions":{"allow":["Bash(ls:*)"]}}');
  } finally { proj.cleanup(); }
});

test("a second run changes nothing and says so", () => {
  for (const id of STACK_IDS) {
    const proj = project(SAMPLES[id].files);
    try {
      runMain(["--dir", proj.dir]);
      const after = snapshot(proj.dir);
      const r = runMain(["--dir", proj.dir]);
      assert.equal(r.code, 0, id);
      assert.deepEqual(snapshot(proj.dir), after, `${id}: second run changed files`);
      assert.match(r.out, /Nothing to do: everything is already in place\./, id);
      assert.match(r.out, /Per session this adds 0 tokens\./);
      assert.doesNotMatch(r.out, /\bcreated\b/);
    } finally { proj.cleanup(); }
  }
});

test("no temporary or backup files are left behind by a fresh run", () => {
  const proj = project(SAMPLES.java.files);
  try {
    runMain(["--dir", proj.dir]);
    assert.deepEqual(tree(proj.dir).filter((f) => /\.tmp-|\.bak-/.test(f)), []);
  } finally { proj.cleanup(); }
});

test("a project in a sub-folder: the kit goes to the project root, and CLAUDE.md says where commands run", () => {
  const proj = project({ "web/package.json": JSON.stringify({ name: "web-app", scripts: { test: "t", build: "b" } }), "web/yarn.lock": "" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 0, r.err);
    assert.ok(proj.has("CLAUDE.md") && proj.has(".claude/settings.json"));
    assert.ok(!proj.has("web/CLAUDE.md") && !proj.has("web/.claude/settings.json"));
    assert.match(proj.read("CLAUDE.md"), /Commands run in `web\/`\./);
    assert.match(proj.read("CLAUDE.md"), /yarn run test/);
    assert.match(proj.read(".claude/skills/test/SKILL.md"), /Commands run in `web\/`\./);
    assert.match(proj.read(".claude/agents/test-runner.md"), /Commands run in `web\/`\./);
    assert.match(r.out, /detected from web\/package\.json/);
  } finally { proj.cleanup(); }
});

test("a named stack overrides detection, and the stack found is still mentioned", () => {
  const proj = project({ "package.json": "{}", "go.mod": "module github.com/acme/api\n" });
  try {
    const detected = runMain(["--dir", proj.dir, "--dry-run"]);
    assert.match(detected.out, /Go: detected from go\.mod/, "go wins the tie at the same level");
    assert.match(detected.out, /Also\s+Node\.js \(package\.json\) was found too; run `claude-starter node`/);
    const named = runMain(["--dir", proj.dir, "node"]);
    assert.match(named.out, /Node\.js: named on the command line; found package\.json/);
    assert.match(proj.read("CLAUDE.md"), /^# /);
    assert.match(proj.read(".claude/settings.json"), /npm publish/);
    assert.doesNotMatch(proj.read(".claude/settings.json"), /goreleaser/);
  } finally { proj.cleanup(); }
});

test("a named stack in a folder with no project files uses defaults and says so", () => {
  const proj = project({ "README.md": "hi" });
  try {
    const r = runMain(["--dir", proj.dir, "go"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /no project files found, so the commands are defaults/);
    assert.match(proj.read("CLAUDE.md"), /go test \.\/\.\.\./);
  } finally { proj.cleanup(); }
});

test("the stack's aliases work on the command line", () => {
  const proj = project({ "README.md": "hi" });
  try {
    runMain(["--dir", proj.dir, "ts", "--dry-run"]);
    assert.match(runMain(["--dir", proj.dir, "typescript", "--dry-run"]).out, /Node\.js: named/);
    assert.match(runMain(["--dir", proj.dir, "golang", "--dry-run"]).out, /Go: named/);
  } finally { proj.cleanup(); }
});

test("the commands found are listed, with run marked as not written to CLAUDE.md", () => {
  const proj = project(SAMPLES.dotnet.files);
  try {
    const r = runMain(["--dir", proj.dir, "--dry-run"]);
    assert.match(r.out, /Commands found\n\s+build\s+dotnet build MyApp\.sln/);
    assert.match(r.out, /run\s+dotnet run --project src\/MyApp\.Web\/MyApp\.Web\.csproj\s+\(not written to CLAUDE\.md/);
    assert.doesNotMatch(fs.existsSync(proj.p("CLAUDE.md")) ? proj.read("CLAUDE.md") : "", /dotnet run/);
  } finally { proj.cleanup(); }
});

test("a package.json that is not valid JSON is reported as a note, and the kit still works", () => {
  const proj = project({ "package.json": "{ nope" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Note\s+package\.json is not valid JSON, so no scripts were read/);
  } finally { proj.cleanup(); }
});

test("a long solution name that pushes CLAUDE.md over the budget is reported, not hidden", () => {
  const name = "Contoso.Ordering.Platform.Billing.Invoices.Reporting.Service.Host.Application";
  const proj = project({ [`${name}.sln`]: "" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.match(r.out, /Note\s+CLAUDE\.md is about \d+ tokens, over the 250 token target/);
    assert.ok(estimateTokens(proj.read("CLAUDE.md")) >= 250);
  } finally { proj.cleanup(); }
});

test("typical projects never trigger the budget note", () => {
  for (const id of STACK_IDS) {
    const proj = project(SAMPLES[id].files);
    try { assert.doesNotMatch(runMain(["--dir", proj.dir, "--dry-run"]).out, /over the 250 token target/, id); } finally { proj.cleanup(); }
  }
});

test("a file in .claude/ that is not ours, such as settings.local.json, is never touched", () => {
  const proj = project({ ...SAMPLES.go.files, ".claude/settings.local.json": '{"model":"haiku"}\n', ".claude/notes.txt": "mine" });
  try {
    runMain(["--dir", proj.dir]);
    assert.equal(proj.read(".claude/settings.local.json"), '{"model":"haiku"}\n');
    assert.equal(proj.read(".claude/notes.txt"), "mine");
  } finally { proj.cleanup(); }
});

test("with no project files and no stack named: exit 1, the stacks are listed, nothing is written", () => {
  const proj = project({ "README.md": "hi" });
  try {
    const r = runMain(["--dir", proj.dir]);
    assert.equal(r.code, 1);
    assert.match(r.err, /no project files found/);
    for (const id of STACK_IDS) assert.ok(r.err.includes(id), `${id} is listed`);
    assert.deepEqual(tree(proj.dir), ["README.md"]);
  } finally { proj.cleanup(); }
});

test("the home folder, a drive root and Claude Code's own folder are refused", () => {
  const home = tmp("csh-");
  try {
    fs.writeFileSync(path.join(home, "package.json"), "{}");
    const r = runMain(["--dir", home], { home });
    assert.equal(r.code, 1);
    assert.match(r.err, /is your home folder/);
    assert.deepEqual(tree(home), ["package.json"], "nothing written");

    const cfg = path.join(home, "elsewhere", "claude-config");
    fs.mkdirSync(path.join(cfg, "sub"), { recursive: true });
    fs.writeFileSync(path.join(cfg, "sub", "package.json"), "{}");
    const inside = runMain(["--dir", path.join(cfg, "sub")], { home: path.join(home, "h"), env: { CLAUDE_CONFIG_DIR: cfg } });
    assert.equal(inside.code, 1);
    assert.match(inside.err, /inside Claude Code's own config folder/);

    const driveRoot = path.parse(os.tmpdir()).root;
    const root = runMain(["--dir", driveRoot, "--dry-run"], { home });
    assert.equal(root.code, 1);
    assert.match(root.err, /root of a drive/);
  } finally { rmrf(home); }
});

test("a subfolder of the home folder is a fine project", () => {
  const home = tmp("csh-");
  try {
    const proj = path.join(home, "work", "app");
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, "go.mod"), "module x\n");
    const r = runMain(["--dir", proj], { home });
    assert.equal(r.code, 0, r.err);
    assert.ok(fs.existsSync(path.join(proj, "CLAUDE.md")));
    assert.ok(!fs.existsSync(path.join(home, ".claude")), "the home folder's .claude was never created");
  } finally { rmrf(home); }
});

test("the working folder is used when --dir is not given", () => {
  const proj = project(SAMPLES.go.files);
  try {
    const r = runMain([], { cwd: proj.dir });
    assert.equal(r.code, 0, r.err);
    assert.ok(proj.has("CLAUDE.md"));
  } finally { proj.cleanup(); }
});

test("--dir may be relative to the working folder", () => {
  const proj = project({ "app/go.mod": "module x\n" });
  try {
    const r = runMain(["--dir", "app"], { cwd: proj.dir });
    assert.equal(r.code, 0, r.err);
    assert.ok(proj.has("app/CLAUDE.md"));
    assert.ok(!proj.has("CLAUDE.md"));
  } finally { proj.cleanup(); }
});
