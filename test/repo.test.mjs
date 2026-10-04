// The repository itself: package metadata, zero dependencies, Node 18 compatibility, and the files every repo
// in this family carries.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers.mjs";

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const pkg = JSON.parse(read("package.json"));

const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const codeFiles = () => ["bin", "src", "scripts", "test"].flatMap(walk).filter((f) => !f.includes("node_modules"));

test("package.json: name, version, type, bin, engines, scripts and the links", () => {
  assert.equal(pkg.name, "claude-code-starter-kits");
  assert.equal(pkg.version, "1.0.1");
  assert.equal(pkg.type, "module");
  assert.deepEqual(pkg.bin, { "claude-starter": "bin/claude-starter.mjs" });
  assert.deepEqual(pkg.engines, { node: ">=18" });
  assert.equal(pkg.scripts.test, "node --test");
  assert.equal(pkg.repository, "github:nrzz/claude-code-starter-kits");
  assert.equal(pkg.homepage, "https://github.com/nrzz/claude-code-starter-kits#readme");
  assert.equal(pkg.bugs, "https://github.com/nrzz/claude-code-starter-kits/issues");
  assert.equal(pkg.author, "Naresh Prabu");
  assert.equal(pkg.license, "MIT");
  assert.ok(pkg.description.length > 40 && pkg.description.length < 300);
  for (const k of ["claude-code", "claude", "anthropic"]) assert.ok(pkg.keywords.includes(k), k);
});

test("package.json: no dependencies of any kind", () => {
  for (const k of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "bundledDependencies"]) assert.ok(!(k in pkg), k);
});

test("package.json: the files that ship exist, and tests and scripts are not among them", () => {
  assert.deepEqual(pkg.files, ["bin", "src", "kits", "README.md", "LICENSE"]);
  for (const f of pkg.files) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test("the shipped code never imports from the folders that do not ship", () => {
  for (const file of [...walk("src"), ...walk("bin")]) {
    const text = read(file);
    assert.ok(!/from\s+["'][^"']*\/(test|scripts)\//.test(text), `${file} imports from test/ or scripts/`);
  }
});

test("every import is a Node built-in (node:...) or a relative file: nothing from npm", () => {
  for (const file of codeFiles().filter((f) => f.endsWith(".mjs"))) {
    const text = read(file);
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;\n]*?\bfrom\s+["']([^"']+)["']/g)) {
      assert.ok(m[1].startsWith("node:") || m[1].startsWith("./") || m[1].startsWith("../"), `${file} imports ${m[1]}`);
    }
    for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) assert.ok(m[1].startsWith("node:") || m[1].startsWith("."), `${file} imports ${m[1]}`);
    assert.ok(!/\brequire\(/.test(text), `${file} uses require`);
  }
});

test("all code is ESM in .mjs files", () => {
  for (const file of codeFiles()) assert.ok(file.endsWith(".mjs"), file);
});

test("the bin is executable by shebang and short: all the work is in src/", () => {
  const bin = read("bin", "claude-starter.mjs");
  assert.ok(bin.startsWith("#!/usr/bin/env node\n"));
  assert.ok(bin.split("\n").length < 25);
  assert.match(bin, /from "\.\.\/src\/cli\.mjs"/);
});

test("Node 18 compatibility: none of the newer APIs are used", () => {
  // Added after Node 18: array copy methods (20), groupBy (21), import.meta.dirname (20.11), fs.globSync (22),
  // Set methods (22), Promise.withResolvers (22), process.getBuiltinModule (22.3).
  const banned = [/\.toSorted\(/, /\.toReversed\(/, /\.toSpliced\(/, /Object\.groupBy/, /Map\.groupBy/, /Array\.fromAsync/, /import\.meta\.(dirname|filename)/,
    /\bglobSync\b/, /\.(union|intersection|difference|symmetricDifference|isSubsetOf)\(/, /Promise\.withResolvers/, /getBuiltinModule/, /\.isWellFormed\(/];
  for (const file of codeFiles().filter((f) => !f.endsWith("repo.test.mjs"))) {
    const text = read(file).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    for (const re of banned) assert.ok(!re.test(text), `${file} uses ${re}`);
  }
});

test("test files are named *.test.mjs, apart from the helpers", () => {
  for (const f of walk("test")) assert.ok(/\.test\.mjs$/.test(f) || path.basename(f) === "helpers.mjs", f);
});

test("the kits hold only plain data: Markdown and JSON, no code", () => {
  for (const f of walk("kits")) assert.ok(/\.(md|json)$/.test(f), f);
});

test("LICENSE is the MIT license in Naresh Prabu's name", () => {
  const text = read("LICENSE");
  assert.match(text, /^MIT License\n\nCopyright \(c\) 2026 Naresh Prabu\n/);
  assert.match(text, /Permission is hereby granted, free of charge/);
});

test(".gitattributes keeps LF endings everywhere, and .gitignore ignores node_modules", () => {
  assert.equal(read(".gitattributes"), "* text=auto eol=lf\n");
  assert.match(read(".gitignore"), /^node_modules\/$/m);
});

test("CI runs npm test on Windows, macOS and Linux with Node 20, 22 and 24, and on Linux with Node 18", () => {
  const wf = read(".github", "workflows", "test.yml");
  assert.match(wf, /^name: test$/m);
  for (const os of ["ubuntu-latest", "windows-latest", "macos-latest"]) assert.ok(wf.includes(os), os);
  assert.match(wf, /node: \[20, 22, 24\]/);
  assert.match(wf, /- os: ubuntu-latest\s+node: 18\b/, "Node 18 is one more job, on Linux");
  assert.match(wf, /- run: npm test/);
});

test("the source files open with a comment saying what they are", () => {
  for (const file of [...walk("src"), "scripts/samples.mjs", "scripts/token-table.mjs"]) {
    const first = read(file).split("\n").find((l) => !l.startsWith("#!"));
    assert.ok(first.startsWith("//"), `${file} starts with: ${first}`);
  }
});
