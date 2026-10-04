// What a run will do, decided before anything is written. buildPlan reads the project folder and returns a
// list of actions; applyPlan carries them out. --dry-run and --print stop after buildPlan, so what they
// show is exactly what a real run does.
//
// Action kinds:
//   create  a new file                           alt     CLAUDE.starter.md, because CLAUDE.md already exists
//   fill    CLAUDE.md existed but was empty      append  text added to the end of CLAUDE.md or .gitignore
//   merge   rules added to settings.json (after a backup)
//   skip    nothing written, with the reason     error   could not be done and was left untouched
//
// The rule behind all of them: a file that is already there is never replaced.
import fs from "node:fs";
import path from "node:path";
import { exists, lf, readText, timestamp, toPosix, uniquePath, writeFileAtomic, writeNew } from "./fsutil.mjs";
import { countRules, formatSettings, mergeSettings, readSettings, styleOf } from "./settings.mjs";
import { estimateTokens } from "./tokens.mjs";

export const BEGIN = "<!-- claude-starter:begin -->";
export const END = "<!-- claude-starter:end -->";
const GITIGNORE_LINES = ["CLAUDE.local.md", ".claude/settings.local.json"];
const GITIGNORE_HEADER = "# Claude Code: personal files";
export const LAST_HABIT = "Use the test-runner subagent for long builds and test logs.";

const same = (a, b) => lf(a).trim() === lf(b).trim();
const skip = (rel, reason, extra = {}) => ({ kind: "skip", path: rel, reason, ...extra });
const absOf = (root, rel) => path.join(root, ...rel.split("/"));

// Text added to the end of an existing file uses the line endings that file already has.
const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");
const withEol = (text, eol) => (eol === "\n" ? text : text.replace(/\n/g, eol));

// Headings one level deeper, so the starter sits inside someone else's CLAUDE.md as a section of its own.
const demote = (md) => lf(md).split("\n").map((l) => (/^#{1,5}[ \t]/.test(l) ? `#${l}` : l)).join("\n");

/** The text appended to an existing CLAUDE.md by --merge, between markers that make a second run a no-op. */
export function mergeBlock(claudeMd) {
  return `${BEGIN}\n${demote(claudeMd).trimEnd()}\n${END}\n`;
}

function planClaudeMd(root, kit, { merge }) {
  const rel = "CLAUDE.md";
  const file = absOf(root, rel);
  const present = exists(file);
  const existing = present ? readText(file) : null;
  const perSession = (text) => ({ session: estimateTokens(text), sessionLabel: "CLAUDE.md" });

  if (!present) return { kind: "create", path: rel, text: kit.claudeMd, ...perSession(kit.claudeMd) };
  if (existing === null) return skip(rel, "cannot be read; left alone");
  if (!existing.trim()) return { kind: "fill", path: rel, text: kit.claudeMd, ...perSession(kit.claudeMd) };
  if (existing.includes(BEGIN)) return skip(rel, "already has the starter section");
  if (same(existing, kit.claudeMd)) return skip(rel, "already holds this starter");
  // Merged by hand earlier: the starter's last token habit is specific enough to recognise it by.
  if (existing.includes(LAST_HABIT)) return skip(rel, "already has the starter's token habits");
  if (merge) {
    const block = mergeBlock(kit.claudeMd);
    const lead = existing.endsWith("\n") ? "\n" : "\n\n";
    return { kind: "append", path: rel, text: withEol(lead + block, eolOf(existing)), what: "starter section", ...perSession(block) };
  }
  const alt = "CLAUDE.starter.md";
  if (exists(absOf(root, alt))) return skip(alt, "already exists; kept yours", { because: "CLAUDE.md exists" });
  return { kind: "alt", path: alt, text: kit.claudeMd, because: "CLAUDE.md already exists" };
}

function planSettings(root, kit) {
  const rel = ".claude/settings.json";
  const cur = readSettings(absOf(root, rel));
  if (cur.status === "invalid") {
    return { kind: "error", path: rel, message: `${rel} ${cur.reason}, so it was left untouched.`, snippet: formatSettings(kit.settings) };
  }
  if (cur.status === "missing") {
    const p = kit.settings.permissions;
    return { kind: "create", path: rel, text: formatSettings(kit.settings), detail: `${p.allow.length} allow, ${p.deny.length} deny rules` };
  }
  const m = mergeSettings(cur.data, kit.settings);
  if (!m.changed) return skip(rel, "already has these rules", { kept: m.kept });
  return { kind: "merge", path: rel, text: formatSettings(m.merged, styleOf(cur.raw)), added: m.added, kept: m.kept, detail: `+${countRules(m.added)} rules` };
}

// A file the kit owns outright (a skill, the agent): written only if nothing is there.
function planOwned(root, rel, text, extra = {}, conflict = null) {
  if (conflict && exists(absOf(root, conflict.path))) return skip(rel, `you already have ${conflict.what} (${conflict.path}); kept yours`);
  const file = absOf(root, rel);
  if (exists(file)) {
    const cur = readText(file);
    return skip(rel, cur !== null && same(cur, text) ? "already there, unchanged" : "already exists; kept yours");
  }
  return { kind: "create", path: rel, text, ...extra };
}

function planGitignore(root) {
  const rel = ".gitignore";
  const file = absOf(root, rel);
  const present = exists(file);
  const existing = present ? readText(file) : null;
  if (present && existing === null) return skip(rel, "cannot be read; left alone");
  const have = new Set(lf(existing ?? "").split("\n").map((l) => l.trim().replace(/^\//, "")));
  const missing = GITIGNORE_LINES.filter((l) => !have.has(l));
  if (!missing.length) return skip(rel, "already ignores both files");
  // What is written: the entries that are missing, under the comment line (only if it is not there yet),
  // after a blank separator line when the file already has content. The report says so.
  const comment = !have.has(GITIGNORE_HEADER);
  const lines = `${comment ? `${GITIGNORE_HEADER}\n` : ""}${missing.join("\n")}\n`;
  const entries = `${missing.length} ${missing.length === 1 ? "entry" : "entries"}`;
  const under = comment ? ", under a comment line" : "";
  if (!present) return { kind: "create", path: rel, text: lines, detail: `${entries}${under}` };
  const lead = !existing.trim() ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return { kind: "append", path: rel, text: withEol(lead + lines, eolOf(existing)), what: entries, where: `at the end${under}`, added: missing };
}

/**
 * Decide what to do for each file the kit writes.
 * @param kit    the rendered kit (kit.mjs)
 * @param opts   { merge }
 * @returns [action]
 */
export function buildPlan(root, kit, { merge = false } = {}) {
  const actions = [planClaudeMd(root, kit, { merge }), planSettings(root, kit)];
  for (const f of kit.files) {
    const isAgent = f.path.startsWith(".claude/agents/");
    const skill = /^\.claude\/skills\/([^/]+)\//.exec(f.path)?.[1];
    actions.push(planOwned(
      root, f.path, f.text,
      isAgent ? { session: kit.agent.tokens, sessionLabel: `${kit.agent.name} in the agent list` } : { detail: "user-only skill, 0 tokens until you type it" },
      skill ? { path: `.claude/commands/${skill}.md`, what: `a /${skill} command` } : null,
    ));
  }
  actions.push(planGitignore(root));
  return actions;
}

function applyOne(root, a) {
  const file = absOf(root, a.path);
  switch (a.kind) {
    case "create":
    case "alt":
      if (!writeNew(file, a.text)) { a.kind = "skip"; a.reason = "appeared while this ran; kept yours"; }
      break;
    case "fill":
      fs.writeFileSync(file, a.text);
      break;
    case "append":
      fs.appendFileSync(file, a.text);
      break;
    case "merge": {
      const backup = uniquePath(`${file}.bak-starter-${timestamp()}`);
      fs.copyFileSync(file, backup); // the original is safe before anything changes
      writeFileAtomic(file, a.text);
      a.backup = toPosix(path.relative(root, backup));
      break;
    }
    default:
      break; // skip and error write nothing
  }
}

// A short reason for a failed write, without the long path Node puts in its messages.
function explainError(e) {
  const code = e && e.code;
  if (code === "EEXIST" || code === "ENOTDIR") return "a file is in the way of the folder it needs";
  if (code === "EACCES" || code === "EPERM") return "permission denied";
  if (code === "EROFS") return "the file system is read-only";
  if (code === "ENOSPC") return "the disk is full";
  return String((e && e.message) || e).split("\n")[0].slice(0, 120);
}

/** Carry the plan out. An action that fails is marked `failed` (with its message); the others still run. */
export function applyPlan(root, actions) {
  for (const a of actions) {
    try {
      applyOne(root, a);
    } catch (e) {
      a.failed = explainError(e);
    }
  }
  return actions;
}
