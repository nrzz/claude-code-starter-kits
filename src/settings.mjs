// .claude/settings.json: read it without ever modifying it, work out the merge, and format the result the
// way the file was already formatted. Writing (and the backup before it) happens in plan.mjs.
import fs from "node:fs";
import { lf, stripBom } from "./fsutil.mjs";

const LISTS = ["allow", "deny", "ask"];
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * @returns { status, data, raw, reason }
 *   status: "missing" | "ok" (data is a plain object; an empty file counts as {}) | "invalid"
 *   "invalid" also covers a file that cannot be read, and a permissions section that is not shaped as
 *   Claude Code expects (an object holding allow, deny and ask as lists): rather than guess, we leave it alone.
 */
export function readSettings(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return { status: "missing", data: {}, raw: null, reason: "" };
    return { status: "invalid", data: null, raw: null, reason: `cannot be read (${e && e.code ? e.code : "error"})` };
  }
  const text = stripBom(raw);
  if (!text.trim()) return { status: "ok", data: {}, raw, reason: "" };
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { status: "invalid", data: null, raw, reason: "is not valid JSON" };
  }
  if (!isObject(data)) return { status: "invalid", data: null, raw, reason: "is not a JSON object" };
  if ("permissions" in data) {
    if (!isObject(data.permissions)) return { status: "invalid", data: null, raw, reason: '"permissions" is not an object' };
    for (const list of LISTS) {
      if (list in data.permissions && !Array.isArray(data.permissions[list])) {
        return { status: "invalid", data: null, raw, reason: `"permissions.${list}" is not a list` };
      }
    }
  }
  return { status: "ok", data, raw, reason: "" };
}

/**
 * Add the wanted permission rules to `existing`, leaving everything else as it is.
 *  - Every key other than "permissions", and every other key inside it (defaultMode, ...), is kept as it is.
 *  - A rule already in the same list is not added twice.
 *  - A rule the user already has in a different list (allow, deny or ask) is left where they put it: adding
 *    our deny for something they allow, or the other way round, would silently change what they chose.
 * @returns { merged, added: { allow, deny, ask }, kept: [{ rule, list, wanted }], changed }
 */
export function mergeSettings(existing, wanted) {
  const have = isObject(existing.permissions) ? existing.permissions : {};
  const where = new Map(); // rule -> the list the user keeps it in
  for (const list of LISTS) for (const rule of have[list] ?? []) if (!where.has(rule)) where.set(rule, list);

  const permissions = { ...have };
  const added = { allow: [], deny: [], ask: [] };
  const kept = [];
  for (const list of LISTS) {
    const out = [...(have[list] ?? [])];
    for (const rule of wanted.permissions?.[list] ?? []) {
      const at = where.get(rule);
      if (at === list) continue; // already there
      if (at) { kept.push({ rule, list: at, wanted: list }); continue; }
      out.push(rule);
      where.set(rule, list);
      added[list].push(rule);
    }
    if (added[list].length) permissions[list] = out;
  }
  const changed = LISTS.some((l) => added[l].length > 0);
  return { merged: changed ? { ...existing, permissions } : existing, added, kept, changed };
}

/** Indent, line ending and final newline of an existing file, so a merge does not reformat it. */
export function styleOf(raw) {
  if (raw == null || !raw.trim()) return { indent: 2, eol: "\n", finalNewline: true };
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const m = /^([ \t]+)\S/m.exec(raw);
  const indent = m ? (m[1][0] === "\t" ? "\t" : Math.min(m[1].length, 8)) : 2;
  return { indent, eol, finalNewline: /\n$/.test(raw) };
}

/** JSON text for `data` in the given style. */
export function formatSettings(data, style = styleOf(null)) {
  const text = JSON.stringify(data, null, style.indent) + (style.finalNewline ? "\n" : "");
  return style.eol === "\r\n" ? lf(text).replace(/\n/g, "\r\n") : text;
}

/** Number of rules in a wanted/added set. */
export const countRules = (rules) => LISTS.reduce((n, l) => n + (rules[l]?.length ?? 0), 0);
