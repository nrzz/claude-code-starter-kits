// The frontmatter of a skill or subagent file: a block of `key: value` lines between two `---` lines.
// This reads only what the kits write (single-line scalars, optionally quoted, and true or false), and says
// so when it meets anything else. Claude Code reads the same blocks as YAML.
import { lf } from "./fsutil.mjs";

/**
 * @returns { data, body, errors }  data: key -> string | boolean (empty when there is no block)
 */
export function parseFrontmatter(text) {
  const src = lf(String(text ?? ""));
  const errors = [];
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(src);
  if (!m) return { data: {}, body: src, errors: ["no frontmatter block (the file must start with ---)"] };
  const data = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const kv = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/.exec(line);
    if (!kv) { errors.push(`not a "key: value" line: ${line}`); continue; }
    const [, key, raw] = kv;
    if (key in data) errors.push(`duplicate key: ${key}`);
    data[key] = scalar(raw.trim());
  }
  return { data, body: src.slice(m[0].length), errors };
}

function scalar(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const quoted = /^"(.*)"$/.exec(raw) || /^'(.*)'$/.exec(raw);
  return quoted ? quoted[1] : raw;
}
