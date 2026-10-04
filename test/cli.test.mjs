// The command line, through the real bin in a child process (so exit codes and streams are the real ones).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SAMPLES } from "../scripts/samples.mjs";
import { parseArgs, version } from "../src/cli.mjs";
import { formatStackList } from "../src/report.mjs";
import { STACKS, STACK_IDS } from "../src/stacks/index.mjs";
import { ROOT, project, rmrf, runBin, snapshot, tmp, tree } from "./helpers.mjs";

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

test("--help and -h print the usage, name every option and stack, and exit 0 without writing", () => {
  const proj = project(SAMPLES.go.files);
  try {
    const before = snapshot(proj.dir);
    for (const flag of ["--help", "-h"]) {
      const r = runBin([flag], { cwd: proj.dir });
      assert.equal(r.code, 0);
      assert.equal(r.err, "");
      assert.match(r.out, /^claude-starter \d+\.\d+\.\d+: /);
      for (const opt of ["--dir", "--dry-run", "--print", "--merge", "--list", "--help", "--version"]) assert.ok(r.out.includes(opt), `${flag}: ${opt}`);
      for (const id of STACK_IDS) assert.ok(r.out.includes(id), `${flag}: ${id}`);
      assert.match(r.out, /Never overwrites/);
    }
    assert.deepEqual(snapshot(proj.dir), before);
  } finally { proj.cleanup(); }
});

test("--version and -v print the package version", () => {
  for (const flag of ["--version", "-v"]) {
    const r = runBin([flag]);
    assert.equal(r.code, 0);
    assert.equal(r.out.trim(), pkg.version);
  }
  assert.equal(pkg.version, "1.0.1");
  assert.equal(version(), pkg.version);
});

test("an unknown option exits 1 with the option named and a pointer to --help; nothing is written", () => {
  const proj = project(SAMPLES.go.files);
  try {
    const before = snapshot(proj.dir);
    const r = runBin(["--frobnicate"], { cwd: proj.dir });
    assert.equal(r.code, 1);
    assert.match(r.err, /unknown option "--frobnicate"/);
    assert.match(r.err, /claude-starter --help/);
    assert.deepEqual(snapshot(proj.dir), before);
  } finally { proj.cleanup(); }
});

test("two stacks, or an unknown one, exit 1 and name the choices", () => {
  const two = runBin(["go", "node"]);
  assert.equal(two.code, 1);
  assert.match(two.err, /one stack at a time \(got "go" and "node"\)/);
  const unknown = runBin(["rust"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /unknown stack "rust"/);
  for (const id of STACK_IDS) assert.ok(unknown.err.includes(id), id);
});

test("--dir needs a folder that exists", () => {
  assert.equal(runBin(["--dir"]).code, 1);
  assert.match(runBin(["--dir"]).err, /--dir needs a folder/);
  assert.match(runBin(["--dir", "--dry-run"]).err, /--dir needs a folder/);
  const proj = project({ "file.txt": "x" });
  try {
    const missing = runBin(["--dir", proj.p("nope")]);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /is not a folder/);
    assert.match(runBin(["--dir", proj.p("file.txt")]).err, /is not a folder/);
  } finally { proj.cleanup(); }
});

test("--dir=<path> works like --dir <path>", () => {
  const proj = project(SAMPLES.go.files);
  try {
    const r = runBin([`--dir=${proj.dir}`, "--dry-run"]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Go: detected from go\.mod/);
  } finally { proj.cleanup(); }
});

test("--list names the six stacks with what each is detected from, and marks what is found here", () => {
  const proj = project({ ...SAMPLES.go.files });
  try {
    const before = snapshot(proj.dir);
    const r = runBin(["--list"], { cwd: proj.dir });
    assert.equal(r.code, 0);
    for (const id of STACK_IDS) assert.match(r.out, new RegExp(`^\\s+${id}\\s`, "m"), id);
    assert.match(r.out, /\*\.sln/);
    assert.match(r.out, /pubspec\.yaml/);
    assert.match(r.out, /go\.mod\s+<- found here/);
    assert.doesNotMatch(r.out, /pubspec\.yaml\s+<- found here/);
    assert.deepEqual(snapshot(proj.dir), before);
  } finally { proj.cleanup(); }
});

test("--list: every description is padded to the longest one, so none runs into the file names after it", () => {
  const proj = project(SAMPLES.node.files);
  try {
    const r = runBin(["--list"], { cwd: proj.dir });
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.out, /Expresspackage/, "Node's description is the longest, and used to touch its markers");
    const lines = r.out.split("\n");
    const columns = new Set();
    for (const s of STACKS) {
      const line = lines.find((l) => l.startsWith(`  ${s.id} `));
      assert.ok(line, `${s.id} has a line`);
      const aboutEnd = line.indexOf(s.about) + s.about.length;
      const markersAt = line.indexOf(s.markers, aboutEnd);
      assert.ok(markersAt >= aboutEnd + 2, `${s.id}: two spaces at least between the description and ${s.markers}`);
      assert.match(line.slice(aboutEnd, markersAt), /^ +$/, `${s.id}: only padding in between`);
      columns.add(markersAt);
    }
    assert.equal(columns.size, 1, "the markers start in one column");
  } finally { proj.cleanup(); }
});

test("formatStackList: the description column is as wide as the longest description, whatever its length", () => {
  const stacks = [
    { id: "a", about: "x".repeat(80), markers: "one.json" },
    { id: "bb", about: "short", markers: "two.json" },
  ];
  assert.deepEqual(formatStackList(stacks, ["bb"]), [
    `  a   ${"x".repeat(80)}  one.json`,
    `  bb  short${" ".repeat(77)}two.json   <- found here`,
  ]);
});

test("a real run through the bin: files written, exit 0, summary on stdout, nothing on stderr", () => {
  const proj = project(SAMPLES.dotnet.files);
  try {
    const r = runBin([], { cwd: proj.dir });
    assert.equal(r.code, 0, r.err);
    assert.equal(r.err, "");
    assert.match(r.out, /^claude-starter 1\.0\.1\n/);
    assert.match(r.out, /created\s+CLAUDE\.md/);
    for (const f of [".claude/settings.json", ".claude/skills/test/SKILL.md", ".claude/skills/check/SKILL.md", ".claude/agents/test-runner.md", ".gitignore"]) assert.ok(proj.has(f), f);
    const again = runBin([], { cwd: proj.dir });
    assert.equal(again.code, 0);
    assert.match(again.out, /Nothing to do/);
  } finally { proj.cleanup(); }
});

test("nothing found: exit 1, the message on stderr, the stack list too", () => {
  const proj = project({ "notes.txt": "x" });
  try {
    const r = runBin([], { cwd: proj.dir });
    assert.equal(r.code, 1);
    assert.match(r.err, /no project files found/);
    assert.match(r.err, /dotnet/);
    assert.equal(r.out, "");
    assert.deepEqual(tree(proj.dir), ["notes.txt"]);
  } finally { proj.cleanup(); }
});

test("run in the home folder: refused, and nothing is created there", () => {
  const home = tmp("csh-");
  try {
    fs.writeFileSync(path.join(home, "package.json"), "{}");
    const r = runBin([], { cwd: home, home });
    assert.equal(r.code, 1);
    assert.match(r.err, /is your home folder/);
    assert.deepEqual(tree(home), ["package.json"]);
  } finally { rmrf(home); }
});

test("an invalid settings.json: exit code 1 from the real process, with the snippet on stderr", () => {
  const proj = project({ ...SAMPLES.go.files, ".claude/settings.json": "{" });
  try {
    const r = runBin([], { cwd: proj.dir });
    assert.equal(r.code, 1);
    assert.match(r.err, /not valid JSON, so it was left untouched/);
    assert.equal(proj.read(".claude/settings.json"), "{");
  } finally { proj.cleanup(); }
});

test("the bin can be run from another folder with --dir, and never writes next to itself", () => {
  const proj = project(SAMPLES.python.files);
  const elsewhere = tmp();
  try {
    const before = snapshot(elsewhere);
    const r = runBin(["--dir", proj.dir], { cwd: elsewhere });
    assert.equal(r.code, 0, r.err);
    assert.ok(proj.has("CLAUDE.md"));
    assert.deepEqual(snapshot(elsewhere), before, "the working folder was not touched");
  } finally { proj.cleanup(); rmrf(elsewhere); }
});

test("parseArgs: every option, in any order", () => {
  const a = parseArgs(["--merge", "node", "--dir", "x", "--print", "--dry-run", "--list"]);
  assert.deepEqual({ ...a, errors: [] }, { stack: "node", dir: "x", dryRun: true, print: true, merge: true, list: true, help: false, version: false, errors: [] });
  assert.deepEqual(parseArgs([]).errors, []);
  assert.deepEqual(parseArgs(["-x"]).errors, ['unknown option "-x"']);
  assert.equal(parseArgs(["--dir="]).errors.length, 1);
});
