// From a detected project to the values the templates use: the project's own commands, and the exact
// prefixes for permission rules.
import path from "node:path";
import { cmdText } from "./cmd.mjs";
import { listDir } from "./fsutil.mjs";
import { stackById } from "./stacks/index.mjs";

// Commands every template can show. Each gets a value ("" when the project has no such command) and, for
// the five that are not "test one" and "run", a `<name>Rule`: the prefix a permission rule matches, such as
// "npm run lint".
const COMMANDS = ["build", "typecheck", "test", "testOne", "lint", "format", "run"];
const RULE_COMMANDS = ["build", "typecheck", "test", "lint", "format"];

const allowList = (cmds) => [...new Set(cmds.filter(Boolean).map((c) => `Bash(${c.run}:*)`))].join(", ");

/**
 * Flat placeholder values for the templates. Every key a template may use is present ("" when empty).
 * A project found in a sub-folder gets `where`, one line telling Claude where the commands run, instead of
 * a "cd web &&" in front of every command (which costs more tokens the longer the path is).
 */
function toVars(facts, rel) {
  const cwd = facts.cwd ?? rel;
  const c = facts.commands;
  const vars = { name: facts.name, where: cwd === "." ? "" : `Commands run in \`${cwd}/\`.` };
  for (const key of COMMANDS) vars[key] = c[key] ? cmdText(c[key]) : "";
  for (const key of RULE_COMMANDS) vars[`${key}Rule`] = c[key] ? c[key].run : "";
  vars.lintFormat = [c.lint, c.format].filter(Boolean).map((x) => `\`${cmdText(x)}\``).join(", ");
  vars.allowTest = allowList([c.test, c.testOne]);
  vars.allowCheck = allowList([c.build, c.typecheck, c.lint, c.test]);
  return { ...vars, ...facts.extras };
}

/**
 * Read the project at `dir` (found `rel` below the root) with the stack's own rules.
 * @returns the stack's facts plus `vars`
 */
export function gatherFacts(stackId, dir, rel = ".") {
  const stack = stackById(stackId);
  if (!stack) throw new Error(`unknown stack "${stackId}"`);
  const files = listDir(dir).filter((e) => !e.isDirectory()).map((e) => e.name);
  const facts = stack.facts({ dir, rel, files, dirName: path.basename(dir) });
  facts.notes = facts.notes || [];
  return { ...facts, vars: toVars(facts, rel) };
}
