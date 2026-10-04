// What the command prints: the stack and commands it found, one line per file (created, merged or skipped),
// and what the files cost in tokens in every session. Plain text, ASCII only.
import { describeMatch } from "./detect.mjs";
import { formatSettings } from "./settings.mjs";
import { CLAUDE_MD_BUDGET } from "./tokens.mjs";

// [verb when written, verb in a preview]
const VERBS = {
  create: ["created", "would create"],
  alt: ["created", "would create"],
  fill: ["filled in", "would fill in"],
  append: ["merged", "would merge"],
  merge: ["merged", "would merge"],
  skip: ["skipped", "would skip"],
  error: ["not done", "cannot do"],
};

const COMMAND_LABELS = [["build", "build"], ["typecheck", "typecheck"], ["test", "test"], ["testOne", "test one"], ["lint", "lint"], ["format", "format"], ["run", "run"]];
const ALSO_LIMIT = 4;

const pad = (s, n) => String(s).padEnd(n);
const WRITES = ["create", "fill", "append"];

// The right-hand column of the file list.
function describe(a, preview) {
  if (a.failed) return a.failed;
  const added = preview ? "would be added" : "added";
  const tokens = a.session ? `about ${a.session} tokens in every session` : "";
  switch (a.kind) {
    case "create": return [a.detail, tokens].filter(Boolean).join("; ");
    case "alt": return `${a.because}; Claude Code does not read this name`;
    case "fill": return [preview ? "the existing file is empty" : "the existing file was empty", tokens].filter(Boolean).join("; ");
    case "append": return [`${a.what} ${added} ${a.where ?? "at the end"}`, tokens].filter(Boolean).join("; ");
    case "merge": return `${a.detail} ${added}; ${a.backup ? `backup ${a.backup}` : `the original is backed up first as ${a.path}.bak-starter-<date>-<time>`}`;
    case "skip": return a.reason;
    case "error": return a.message;
    default: return "";
  }
}

/** What a successful run adds to every session: CLAUDE.md (or its merged section) and the agent's line. */
function sessionCost(actions) {
  const parts = actions.filter((a) => a.session && !a.failed && WRITES.includes(a.kind)).map((a) => ({ label: a.sessionLabel, tokens: a.session }));
  return { total: parts.reduce((n, p) => n + p.tokens, 0), parts };
}

// --print: the content of what would be written (for a merge, the rules that would be added).
function printedFiles(actions) {
  const out = [];
  for (const a of actions) {
    if (a.failed) continue;
    if (["create", "alt", "fill"].includes(a.kind)) out.push(`----- ${a.path} -----`, a.text.replace(/\n$/, ""), "");
    else if (a.kind === "append") out.push(`----- ${a.path} (added at the end) -----`, a.text.replace(/^(\r?\n)+/, "").replace(/\r?\n$/, ""), "");
    else if (a.kind === "merge") {
      const added = Object.fromEntries(Object.entries(a.added).filter(([, rules]) => rules.length));
      out.push(`----- ${a.path} (rules added) -----`, formatSettings({ permissions: added }).replace(/\n$/, ""), "");
    }
  }
  return out;
}

function stackLines({ detection, label, facts }) {
  const found = detection.markers.length ? describeMatch(detection) : "";
  const how = detection.how === "detected" ? `detected from ${found}`
    : detection.how === "named" ? `named on the command line; found ${found}`
      : "named on the command line; no project files found, so the commands are defaults";
  const out = [`Stack     ${label}: ${how}${facts.summary ? ` (${facts.summary})` : ""}`];
  for (const alt of detection.alternatives.slice(0, ALSO_LIMIT)) {
    out.push(`Also      ${alt.stackLabel} (${describeMatch(alt)}) was found too; run \`claude-starter ${alt.stack}\` to use that instead.`);
  }
  if (detection.alternatives.length > ALSO_LIMIT) out.push(`Also      ${detection.alternatives.length - ALSO_LIMIT} more stacks were found.`);
  for (const n of facts.notes) out.push(`Note      ${n}`);
  return out;
}

function commandLines(facts) {
  const shown = COMMAND_LABELS.filter(([key]) => facts.vars[key]);
  if (!shown.length) return ["  none"];
  return shown.map(([key, name]) => `  ${pad(name, 10)} ${facts.vars[key]}${key === "run" ? "   (not written to CLAUDE.md: it would cost tokens in every session)" : ""}`);
}

/**
 * @param info { version, root, detection, label, facts, actions, dryRun, print }
 * @returns { out: [lines], err: [lines] }  err holds what a person has to act on (the settings.json snippet)
 */
export function formatReport(info) {
  const { version, root, detection, label, facts, actions, dryRun, print } = info;
  const preview = dryRun || print;
  const out = [`claude-starter ${version}${preview ? " (preview: nothing is written)" : ""}`, `Project   ${root}`];
  const err = [];
  out.push(...stackLines({ detection, label, facts }));
  out.push("", "Commands found", ...commandLines(facts));

  out.push("", "Files");
  const width = Math.max(...actions.map((a) => a.path.length)) + 2;
  for (const a of actions) {
    const verb = a.failed ? "failed" : VERBS[a.kind][preview ? 1 : 0];
    out.push(`  ${pad(verb, 13)}${pad(a.path, width)}${describe(a, preview)}`);
    for (const k of a.kept || []) out.push(`  ${pad("", 13)}kept your rule ${k.rule} in "${k.list}"; not added to "${k.wanted}"`);
    if (a.kind === "error") err.push("", `${a.message} Add this inside the top-level object by hand, then run again:`, "", ...a.snippet.replace(/\n$/, "").split("\n").map((l) => `  ${l}`));
  }

  const alt = actions.find((a) => a.kind === "alt" && !a.failed);
  if (alt) {
    out.push("", `CLAUDE.md already exists, so the starter ${preview ? "would go" : "went"} to ${alt.path}. To combine them, copy the lines you want into CLAUDE.md and delete ${alt.path},`);
    out.push("or run again with --merge to append the starter to CLAUDE.md as a marked section (once).");
  }

  const cost = sessionCost(actions);
  const lead = preview ? "Per session this would add" : "Per session this adds";
  out.push("");
  if (cost.total > 0) out.push(`${lead} about ${cost.total} tokens (${cost.parts.map((p) => `${p.label} ${p.tokens}`).join(", ")}). The skills are user-only: 0 until you type /test or /check.`);
  else out.push(`${lead} 0 tokens.${alt ? " CLAUDE.starter.md is not read until you merge it." : ""}`);

  // The kits fit the budget with typical names. Long solution, project or folder names add tokens to every
  // command that repeats them: say so rather than let it pass unnoticed.
  const heavy = actions.find((a) => a.sessionLabel === "CLAUDE.md" && a.session >= CLAUDE_MD_BUDGET && !a.failed && WRITES.includes(a.kind));
  if (heavy) out.push(`Note      CLAUDE.md is about ${heavy.session} tokens, over the ${CLAUDE_MD_BUDGET} token target, because long names are repeated in its commands. Shorten it by hand if you like.`);

  const written = actions.filter((a) => !["skip", "error"].includes(a.kind) && !a.failed).length;
  const trouble = actions.some((a) => a.kind === "error" || a.failed);
  if (!written && !trouble) out.push("Nothing to do: everything is already in place.");
  else if (written && !preview) out.push("Review the files, then commit CLAUDE.md and .claude/ so the whole team gets them.");
  if (print) out.push("", ...printedFiles(actions));
  return { out, err };
}

/** The stack listing used by --list and by the "nothing detected" message. */
export function formatStackList(stacks, detectedIds = []) {
  // Each column is as wide as its longest entry plus a two-space gap, so no description runs into the markers.
  const idWidth = Math.max(...stacks.map((s) => s.id.length)) + 2;
  const aboutWidth = Math.max(...stacks.map((s) => s.about.length)) + 2;
  return stacks.map((s) => `  ${pad(s.id, idWidth)}${pad(s.about, aboutWidth)}${s.markers}${detectedIds.includes(s.id) ? "   <- found here" : ""}`);
}
