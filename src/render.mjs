// Templates are plain files with {{placeholders}}. The rules, which are the whole language:
//
//   Text (CLAUDE.md, skills, the agent)
//     - {{name}} is replaced by the value of `name`.
//     - A line that uses a placeholder whose value is empty is dropped. That is how a command the project
//       does not have (no lint script, say) disappears instead of leaving an empty bullet.
//     - A heading left with nothing under it is dropped too, and runs of blank lines become one.
//   JSON (settings.json)
//     - Placeholders inside a string are replaced; a string whose placeholder is empty is dropped from its
//       array (or its object).
//     - An array element that is exactly "{{name}}" and whose value is a list is replaced by the list's items.
//
// A placeholder the values do not define is a bug in a template, and rendering stops with an error that
// names the file, so a typo can never silently drop a line.
import { lf } from "./fsutil.mjs";

const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;
const WHOLE = /^\{\{([A-Za-z][A-Za-z0-9]*)\}\}$/;

const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function names(text, vars, file) {
  const found = [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
  for (const n of found) if (!(n in vars)) throw new Error(`${file}: unknown placeholder {{${n}}}`);
  return found;
}

const headingLevel = (line) => /^(#{1,6})[ \t]/.exec(line)?.[1].length ?? 0;

// Drop a heading when the next non-blank line is another heading of the same or a higher level (or the end).
function dropEmptyHeadings(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const level = headingLevel(lines[i]);
    if (level) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      const nextLevel = j < lines.length ? headingLevel(lines[j]) : 0;
      if (j >= lines.length || (nextLevel && nextLevel <= level)) continue;
    }
    out.push(lines[i]);
  }
  return out;
}

function tidy(lines) {
  const out = [];
  for (const line of dropEmptyHeadings(lines)) {
    if (line.trim() === "" && (out.length === 0 || out[out.length - 1].trim() === "")) continue;
    out.push(line.replace(/[ \t]+$/, ""));
  }
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n") + "\n";
}

/** Fill a text template. */
export function renderText(template, vars, file = "template") {
  const out = [];
  for (const line of lf(template).split("\n")) {
    const used = names(line, vars, file);
    if (used.some((n) => isEmpty(vars[n]))) continue;
    out.push(used.length ? line.replace(PLACEHOLDER, (_, n) => String(vars[n])) : line);
  }
  return tidy(out);
}

const DROP = Symbol("drop");

function fillString(str, vars, file) {
  const whole = WHOLE.exec(str);
  if (whole) {
    names(str, vars, file);
    const v = vars[whole[1]];
    if (Array.isArray(v)) return v;
  }
  const used = names(str, vars, file);
  if (used.some((n) => isEmpty(vars[n]))) return DROP;
  return used.length ? str.replace(PLACEHOLDER, (_, n) => String(vars[n])) : str;
}

function fillValue(value, vars, file) {
  if (typeof value === "string") return fillString(value, vars, file);
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const filled = fillValue(item, vars, file);
      if (filled === DROP) continue;
      if (typeof item === "string" && WHOLE.test(item) && Array.isArray(filled)) out.push(...filled);
      else out.push(filled);
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const filled = fillValue(v, vars, file);
      if (filled !== DROP) out[k] = filled;
    }
    return out;
  }
  return value;
}

/** Fill a JSON template (given as text) and return the object. */
export function renderJson(template, vars, file = "template.json") {
  let data;
  try { data = JSON.parse(lf(template)); } catch (e) { throw new Error(`${file}: not valid JSON (${e.message})`); }
  return fillValue(data, vars, file);
}
