import test from "node:test";
import assert from "node:assert/strict";
import { describeMatch, detect, pickStack, scan } from "../src/detect.mjs";
import { STACK_IDS, resolveStackName } from "../src/stacks/index.mjs";
import { project } from "./helpers.mjs";

// detect() on a folder holding just these files; `named` is an explicit stack.
function detectIn(files, named = null) {
  const proj = project(files);
  try { return detect(proj.dir, named); } finally { proj.cleanup(); }
}

const EMPTY = "";

test("stacks: the six kits", () => {
  assert.deepEqual(STACK_IDS, ["dotnet", "node", "python", "go", "flutter", "java"]);
});

test("dotnet: a .sln file", () => {
  const d = detectIn({ "App.sln": EMPTY });
  assert.equal(d.stack, "dotnet");
  assert.deepEqual(d.markers, ["App.sln"]);
  assert.equal(d.rel, ".");
});

test("dotnet: a lone .csproj", () => {
  assert.equal(detectIn({ "App.csproj": EMPTY }).stack, "dotnet");
});

test("dotnet: .slnx and .fsproj count too", () => {
  assert.equal(detectIn({ "App.slnx": EMPTY }).stack, "dotnet");
  assert.equal(detectIn({ "App.fsproj": EMPTY }).stack, "dotnet");
});

test("node: package.json", () => {
  const d = detectIn({ "package.json": "{}" });
  assert.equal(d.stack, "node");
  assert.deepEqual(d.markers, ["package.json"]);
});

test("python: pyproject.toml, requirements.txt or setup.py", () => {
  for (const f of ["pyproject.toml", "requirements.txt", "setup.py"]) assert.equal(detectIn({ [f]: EMPTY }).stack, "python", f);
});

test("go: go.mod", () => {
  assert.equal(detectIn({ "go.mod": "module x\n" }).stack, "go");
});

test("flutter: pubspec.yaml", () => {
  assert.equal(detectIn({ "pubspec.yaml": "name: x\n" }).stack, "flutter");
});

test("java: pom.xml, build.gradle and build.gradle.kts", () => {
  for (const f of ["pom.xml", "build.gradle", "build.gradle.kts"]) assert.equal(detectIn({ [f]: EMPTY }).stack, "java", f);
});

test("java: a Gradle settings file alone, Groovy or Kotlin, is enough", () => {
  for (const f of ["settings.gradle", "settings.gradle.kts"]) assert.equal(detectIn({ [f]: EMPTY }).stack, "java", f);
});

test("nothing recognisable: no stack, no alternatives", () => {
  const d = detectIn({ "README.md": "hello", "notes.txt": "x" });
  assert.equal(d.stack, null);
  assert.equal(d.how, "none");
  assert.deepEqual(d.alternatives, []);
});

test("a project in a sub-folder is found down to three levels, not four", () => {
  assert.deepEqual([detectIn({ "server/go.mod": "module x" }).stack, detectIn({ "server/go.mod": "module x" }).rel], ["go", "server"]);
  assert.equal(detectIn({ "a/b/go.mod": "module x" }).rel, "a/b");
  assert.equal(detectIn({ "a/b/c/go.mod": "module x" }).rel, "a/b/c");
  assert.equal(detectIn({ "a/b/c/d/go.mod": "module x" }).stack, null);
});

test("generated and dependency folders are not searched", () => {
  const files = {
    "node_modules/dep/package.json": "{}",
    "bin/App.csproj": EMPTY,
    "obj/App.csproj": EMPTY,
    "dist/package.json": "{}",
    "build/pom.xml": EMPTY,
    "target/pom.xml": EMPTY,
    "venv/requirements.txt": EMPTY,
    ".git/package.json": "{}",
    ".hidden/go.mod": "module x",
  };
  assert.equal(detectIn(files).stack, null);
});

test("folders with names that could not appear safely in a generated file are not searched", () => {
  assert.equal(detectIn({ "a$b/go.mod": "module x" }).stack, null);
  assert.equal(detectIn({ "a`b/package.json": "{}" }).stack, null);
  assert.equal(detectIn({ "my app/go.mod": "module x" }).rel, "my app", "a space is fine");
});

test("mixed: the match closest to the root wins, and the rest are listed with their paths", () => {
  const d = detectIn({ "package.json": "{}", "server/Api.csproj": EMPTY });
  assert.equal(d.stack, "node");
  assert.deepEqual(d.alternatives.map((a) => [a.stack, a.rel]), [["dotnet", "server"]]);
  assert.equal(describeMatch(d.alternatives[0]), "server/Api.csproj");
});

test("mixed: a deeper project loses to a shallower one of another stack", () => {
  const d = detectIn({ "backend/pom.xml": EMPTY, "frontend/web/package.json": "{}" });
  assert.equal(d.stack, "java");
  assert.deepEqual(d.alternatives.map((a) => a.stack), ["node"]);
});

test("mixed, same folder: dotnet, java, go, flutter and python all beat package.json", () => {
  for (const [marker, stack] of [["App.sln", "dotnet"], ["pom.xml", "java"], ["go.mod", "go"], ["pubspec.yaml", "flutter"], ["pyproject.toml", "python"]]) {
    const d = detectIn({ "package.json": "{}", [marker]: EMPTY });
    assert.equal(d.stack, stack, marker);
    assert.deepEqual(d.alternatives.map((a) => a.stack), ["node"], marker);
  }
});

test("mixed, same folder: the tie order is dotnet, java, go, flutter, python, node", () => {
  const all = { "App.sln": EMPTY, "pom.xml": EMPTY, "go.mod": "m", "pubspec.yaml": "n", "pyproject.toml": EMPTY, "package.json": "{}" };
  const d = detectIn(all);
  assert.equal(d.stack, "dotnet");
  assert.deepEqual(d.alternatives.map((a) => a.stack), ["java", "go", "flutter", "python", "node"]);
});

test("mixed: the same stack found twice is never an alternative", () => {
  const d = detectIn({ "package.json": "{}", "apps/web/package.json": "{}", "apps/api/package.json": "{}" });
  assert.equal(d.stack, "node");
  assert.equal(d.rel, ".");
  assert.deepEqual(d.alternatives, []);
});

test("mixed: in a monorepo of two node folders the first by name wins", () => {
  const d = detectIn({ "apps/web/package.json": "{}", "apps/api/package.json": "{}" });
  assert.equal(d.rel, "apps/api");
});

test("a Flutter project's android/ Gradle build is not a second project", () => {
  const d = detectIn({ "pubspec.yaml": "name: x\n", "android/build.gradle": EMPTY, "android/app/build.gradle": EMPTY });
  assert.equal(d.stack, "flutter");
  assert.deepEqual(d.alternatives, []);
});

test("a React Native style project's android/ Gradle build is not a second project", () => {
  const d = detectIn({ "package.json": "{}", "android/build.gradle": EMPTY });
  assert.equal(d.stack, "node");
  assert.deepEqual(d.alternatives, []);
});

test("an android/ Gradle build still counts when nothing else is at the root", () => {
  assert.equal(detectIn({ "android/build.gradle": EMPTY }).stack, "java");
});

test("naming a stack uses its closest project, in a sub-folder when needed", () => {
  const d = detectIn({ "package.json": "{}", "server/Api.csproj": EMPTY }, "dotnet");
  assert.equal(d.stack, "dotnet");
  assert.equal(d.rel, "server");
  assert.equal(d.how, "named");
  assert.deepEqual(d.alternatives.map((a) => a.stack), ["node"], "the other stack is still reported");
});

test("naming a stack with no project files: the root, with defaults", () => {
  const d = detectIn({ "README.md": "x" }, "go");
  assert.equal(d.stack, "go");
  assert.equal(d.rel, ".");
  assert.equal(d.how, "named, no marker files found");
  assert.deepEqual(d.markers, []);
});

test("stack names and their aliases", () => {
  for (const id of STACK_IDS) assert.equal(resolveStackName(id), id);
  const aliases = { ts: "node", typescript: "node", js: "node", javascript: "node", nodejs: "node", csharp: "dotnet", ".NET": "dotnet", golang: "go", py: "python", dart: "flutter", " Python ": "python", NODE: "node" };
  for (const [alias, id] of Object.entries(aliases)) assert.equal(resolveStackName(alias), id, alias);
  for (const bad of ["rust", "", "list", null, undefined]) assert.equal(resolveStackName(bad), null, String(bad));
});

test("scan: closest to the root first, folders in name order", () => {
  const proj = project({ "b/go.mod": "m", "a/package.json": "{}", "go.mod": "m" });
  try {
    assert.deepEqual(scan(proj.dir).map((m) => `${m.rel}:${m.stack}`), [".:go", "a:node", "b:go"]);
  } finally { proj.cleanup(); }
});

test("pickStack: nothing in, nothing out", () => {
  assert.deepEqual(pickStack([]), { pick: null, alternatives: [] });
});

test("the android/ Gradle build is not a second project, wherever the Flutter or Node project sits", () => {
  const nested = detectIn({ "app/pubspec.yaml": "name: x\n", "app/android/build.gradle.kts": EMPTY, "app/android/settings.gradle.kts": EMPTY });
  assert.equal(nested.rel, "app");
  assert.deepEqual(nested.alternatives, []);
  const rn = detectIn({ "mobile/package.json": "{}", "mobile/android/app/build.gradle": EMPTY });
  assert.deepEqual(rn.alternatives, []);
});

test("an android/ folder elsewhere in the repo is still a project of its own", () => {
  const d = detectIn({ "app/pubspec.yaml": "name: x\n", "other/android/build.gradle": EMPTY });
  assert.deepEqual(d.alternatives.map((a) => a.stack), ["java"]);
});

test("a file name with control characters is printed with them replaced, so it cannot drive the terminal", () => {
  const proj = project({ "a.sln": "" });
  try {
    const d = detect(proj.dir);
    const evil = { ...d, markers: ["x\x1b[2Jy.sln", "tab\there.sln"] };
    assert.equal(describeMatch(evil), "x?[2Jy.sln, tab?here.sln");
  } finally { proj.cleanup(); }
});
