// Shared test helpers. Everything happens in folders under the OS temp folder, and the command line is
// always run with HOME, USERPROFILE and CLAUDE_CONFIG_DIR pointing at a throwaway folder, so no test can
// reach the real ~/.claude.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.mjs";
import { detect } from "../src/detect.mjs";
import { gatherFacts } from "../src/facts.mjs";
import { parseFrontmatter } from "../src/frontmatter.mjs";
import { renderKit } from "../src/kit.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BIN = path.join(ROOT, "bin", "claude-starter.mjs");

/** A new empty folder under the temp folder (real path, short name). */
export function tmp(prefix = "cs-") {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

/**
 * A throwaway project folder holding `files` (relative path -> text).
 * Returns { dir, p(...parts), read(rel), has(rel), write(rel, text), cleanup() }.
 */
export function project(files = {}) {
  const dir = tmp();
  const p = (...parts) => path.join(dir, ...parts.flatMap((x) => x.split("/")));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
    fs.writeFileSync(p(rel), text);
  };
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return {
    dir, p, write,
    read: (rel) => fs.readFileSync(p(rel), "utf8"),
    has: (rel) => fs.existsSync(p(rel)),
    cleanup: () => rmrf(dir),
  };
}

/** Run the command in-process, capturing what it prints. A fake home folder keeps the home guard honest. */
export function runMain(args, { cwd, home = path.join(os.tmpdir(), "cs-no-such-home"), env = {} } = {}) {
  const out = [];
  const err = [];
  const code = main(args, { cwd, home, env: { ...env }, io: { out: (s = "") => out.push(s), err: (s = "") => err.push(s) } });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** Run the real bin in a child process with a throwaway home. */
export function runBin(args, { cwd, env = {}, home } = {}) {
  const fakeHome = home ?? tmp("csh-");
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, CLAUDE_CONFIG_DIR: path.join(fakeHome, ".claude"), NO_COLOR: "1", ...env },
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  if (!home) rmrf(fakeHome);
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

/**
 * Detect, read and render a throwaway project the way a real run does, without writing anything.
 * @returns { detection, facts, kit }
 */
export function renderProject(files, named = null) {
  const proj = project(files);
  try {
    const detection = detect(proj.dir, named);
    const facts = gatherFacts(detection.stack, path.join(proj.dir, ...detection.rel.split("/")), detection.rel);
    return { detection, facts, kit: renderKit(detection.stack, facts.vars) };
  } finally { proj.cleanup(); }
}

/** Every file below `dir` as sorted forward-slash paths. */
export function tree(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else out.push(r);
    }
  };
  walk(dir, "");
  return out.sort();
}

/** path -> content for every file below `dir`, to compare before and after. */
export function snapshot(dir) {
  return Object.fromEntries(tree(dir).map((rel) => [rel, fs.readFileSync(path.join(dir, ...rel.split("/")), "utf8")]));
}

// ---------------------------------------------------------------------------------------------
// The frontmatter checker: what Claude Code 2.1.286 reads from a skill or a subagent file.
// ---------------------------------------------------------------------------------------------

const SKILL_KEYS = ["name", "description", "argument-hint", "allowed-tools", "disable-model-invocation"];
const AGENT_KEYS = ["name", "description", "tools", "model"];
const AGENT_TOOLS = ["Bash", "Read", "Grep", "Glob", "Edit", "Write"];
const MODELS = ["haiku", "sonnet", "opus", "inherit"];
// Interpreters and launchers: a rule with a wildcard on one of these allows arbitrary code.
const NEVER_ALLOW = /^(node|python3?|bash|sh|zsh|pwsh|powershell|npx|pnpx|bunx|find|xargs|eval|exec|sudo|env|curl|wget|gh api)\b/;

/** Problems with a rendered skill file, as strings; an empty list means it is fine. */
export function checkSkill(text, dirName) {
  const { data, body, errors } = parseFrontmatter(text);
  const problems = [...errors];
  for (const k of Object.keys(data)) if (!SKILL_KEYS.includes(k)) problems.push(`unknown key ${k}`);
  if (data.name !== dirName) problems.push(`name "${data.name}" is not its folder "${dirName}"`);
  if (typeof data.description !== "string" || !data.description) problems.push("no description");
  else if (data.description.length >= 60) problems.push(`description is ${data.description.length} characters`);
  if (data["disable-model-invocation"] !== true) problems.push("not user-only (disable-model-invocation: true)");
  if ("allowed-tools" in data) {
    const rules = String(data["allowed-tools"]).split(/,\s*/);
    for (const r of rules) {
      const m = /^Bash\((.+)\)$/.exec(r);
      if (!m) { problems.push(`allowed-tools entry is not Bash(...): ${r}`); continue; }
      if (NEVER_ALLOW.test(m[1])) problems.push(`allowed-tools allows an interpreter or launcher: ${r}`);
      if (m[1].includes(":*") && /(^|[^:])\*/.test(m[1].replace(":*", ""))) problems.push(`mixes :* and *: ${r}`);
    }
  }
  if ("argument-hint" in data && !body.includes("$ARGUMENTS")) problems.push("has an argument-hint but the body never uses $ARGUMENTS");
  if (/\{\{|\}\}/.test(text)) problems.push("an unfilled placeholder is left");
  if (!body.trim()) problems.push("empty body");
  return problems;
}

/** Problems with a rendered subagent file. */
export function checkAgent(text, fileName) {
  const { data, body, errors } = parseFrontmatter(text);
  const problems = [...errors];
  for (const k of Object.keys(data)) if (!AGENT_KEYS.includes(k)) problems.push(`unknown key ${k}`);
  if (data.name !== fileName) problems.push(`name "${data.name}" is not its file name "${fileName}"`);
  if (typeof data.description !== "string" || !data.description) problems.push("no description");
  else if (data.description.length >= 100) problems.push(`description is ${data.description.length} characters`);
  if (data.model !== undefined && !MODELS.includes(data.model)) problems.push(`unknown model ${data.model}`);
  if (data.tools !== undefined) {
    for (const t of String(data.tools).split(/,\s*/)) if (!AGENT_TOOLS.includes(t)) problems.push(`unknown tool ${t}`);
  }
  if (/\{\{|\}\}/.test(text)) problems.push("an unfilled placeholder is left");
  if (!body.trim()) problems.push("empty body");
  return problems;
}

/** Problems with a permission rule: the checks Claude Code's own warnings suggest. */
export function checkRule(rule) {
  const problems = [];
  const m = /^(Bash|Read|Edit|Write)\((.+)\)$/.exec(rule);
  if (!m) return [`not a Tool(...) rule: ${rule}`];
  const [, tool, spec] = m;
  if (tool === "Bash") {
    if (NEVER_ALLOW.test(spec)) problems.push(`rule on an interpreter or launcher: ${rule}`);
    if (/--upload-pack|ext::|-exec|-delete/.test(spec)) problems.push(`arbitrary-code flag in rule: ${rule}`);
    if (spec.includes(":*") && /(^|[^:])\*/.test(spec.replace(":*", ""))) problems.push(`mixes :* and *: ${rule}`);
    if (spec === "*" || spec === ":*") problems.push(`allows every command: ${rule}`);
  }
  return problems;
}
