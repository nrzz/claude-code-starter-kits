// A kit is the set of files written for one stack. The templates are plain files:
//   kits/<stack>/CLAUDE.md       the stack's CLAUDE.md
//   kits/<stack>/settings.json   the stack's permission rules
//   kits/_shared/settings.json   rules every stack gets (git reads, secrets, force-push)
//   kits/_shared/skills/*, kits/_shared/agents/*   the /test and /check skills and the test-runner agent;
//                                the same text for every stack, filled with the project's commands
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./frontmatter.mjs";
import { renderJson, renderText } from "./render.mjs";
import { agentListing, estimateTokens } from "./tokens.mjs";

export const KITS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "kits");

// [template path under kits/_shared, path in the project]
const SHARED_FILES = [
  ["skills/test/SKILL.md", ".claude/skills/test/SKILL.md"],
  ["skills/check/SKILL.md", ".claude/skills/check/SKILL.md"],
  ["agents/test-runner.md", ".claude/agents/test-runner.md"],
];

const readKit = (...parts) => fs.readFileSync(path.join(KITS_DIR, ...parts), "utf8");

// Rules from the shared file first, then the stack's; a rule is listed once.
function mergeRules(a, b) {
  const out = { permissions: {} };
  for (const list of ["allow", "deny"]) {
    const rules = [...(a.permissions?.[list] ?? []), ...(b.permissions?.[list] ?? [])];
    out.permissions[list] = [...new Set(rules)];
  }
  return out;
}

/**
 * Render a stack's kit with the project's values.
 * @returns { claudeMd, settings, files: [{ path, text }], agent: { name, description, tools, listing, tokens } }
 */
export function renderKit(stackId, vars) {
  const settings = mergeRules(
    renderJson(readKit("_shared", "settings.json"), vars, "kits/_shared/settings.json"),
    renderJson(readKit(stackId, "settings.json"), vars, `kits/${stackId}/settings.json`),
  );
  const files = SHARED_FILES.map(([from, to]) => ({
    path: to,
    text: renderText(readKit("_shared", from), vars, `kits/_shared/${from}`),
  }));
  const agentFile = files.find((f) => f.path.startsWith(".claude/agents/"));
  const meta = parseFrontmatter(agentFile.text).data;
  const listing = agentListing(meta);
  return {
    claudeMd: renderText(readKit(stackId, "CLAUDE.md"), vars, `kits/${stackId}/CLAUDE.md`),
    settings,
    files,
    agent: { name: meta.name, description: meta.description, tools: meta.tools, listing, tokens: estimateTokens(listing) },
  };
}
