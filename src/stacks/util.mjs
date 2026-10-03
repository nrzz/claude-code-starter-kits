// What the stack modules need to look at a project: tolerant reads, a few TOML lookups (no TOML parser:
// only "does this table exist" and "what is this string"), and a bounded walk for files.
import path from "node:path";
import { exists, listDir, readText, toPosix } from "../fsutil.mjs";

// Folders that hold generated output, dependencies or tool state. Never searched for project files.
// Folders that start with a dot are skipped as well.
const IGNORED = new Set([
  "node_modules", "bin", "obj", "dist", "build", "out", "target", "vendor", "venv", "env",
  "__pycache__", "coverage", "pods", "site-packages",
]);
export const isIgnoredDir = (name) => name.startsWith(".") || IGNORED.has(name.toLowerCase());

export const read = (dir, name) => readText(path.join(dir, name));
export const has = (dir, name) => exists(path.join(dir, name));

/** package.json and friends: { data, state } with state "ok", "missing" or "invalid". */
export function readJson(dir, name) {
  const text = read(dir, name);
  if (text == null) return { data: null, state: "missing" };
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data) ? { data, state: "ok" } : { data: null, state: "invalid" };
  } catch {
    return { data: null, state: "invalid" };
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the TOML text has a `[table]` header, or a `[table.sub]` one. */
export function tomlHasTable(text, table) {
  return new RegExp(`^[ \\t]*\\[${escapeRe(table)}(\\.[^\\]\\n]+)?\\][ \\t]*(#.*)?$`, "m").test(text || "");
}

/** The string value of `key = "value"` inside `[table]`, or null. */
export function tomlString(text, table, key) {
  const src = String(text || "");
  const head = new RegExp(`^[ \\t]*\\[${escapeRe(table)}\\][ \\t]*(#.*)?$`, "m").exec(src);
  if (!head) return null;
  const rest = src.slice(head.index + head[0].length);
  const next = /^[ \t]*\[/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  const m = new RegExp(`^[ \\t]*${escapeRe(key)}[ \\t]*=[ \\t]*["']([^"'\\n]+)["']`, "m").exec(body);
  return m ? m[1] : null;
}

/**
 * Files below `dir` (at most `maxDepth` folders down) whose name passes `test`, as paths relative to `dir`
 * with forward slashes, in a stable order. Ignored folders are not entered.
 */
export function findFiles(dir, test, { maxDepth = 3 } = {}) {
  const out = [];
  const visit = (abs, rel, depth) => {
    const entries = listDir(abs).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (e.isDirectory()) {
        if (depth < maxDepth && !isIgnoredDir(e.name)) visit(path.join(abs, e.name), rel ? `${rel}/${e.name}` : e.name, depth + 1);
      } else if (test(e.name)) {
        out.push(toPosix(rel ? `${rel}/${e.name}` : e.name));
      }
    }
  };
  visit(dir, "", 0);
  return out;
}

/** A path inside the project as the commands should spell it: relative to the project root. */
export const underRoot = (rel, file) => (rel === "." || !rel ? file : `${rel}/${file}`);
