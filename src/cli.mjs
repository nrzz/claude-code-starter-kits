// claude-starter [stack] [--dir <path>] [--dry-run] [--print] [--merge] [--list]
//
// Detect the project's stack (or take the one named), read its real commands, render the kit, work out what
// to write (plan.mjs), and write it unless this is a preview. See README.md for what each file is.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect, scan } from "./detect.mjs";
import { gatherFacts } from "./facts.mjs";
import { isDir, isInside, samePath } from "./fsutil.mjs";
import { renderKit } from "./kit.mjs";
import { applyPlan, buildPlan } from "./plan.mjs";
import { formatReport, formatStackList } from "./report.mjs";
import { STACKS, STACK_IDS, resolveStackName, stackById } from "./stacks/index.mjs";

const REPO_URL = "https://github.com/nrzz/claude-code-starter-kits";
const consoleIO = { out: (s = "") => console.log(s), err: (s = "") => console.error(s) };

export function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

const HELP = (v) => `claude-starter ${v}: a lean, safe .claude/ for your project, in one command.

Usage: claude-starter [stack] [options]

Stacks: ${STACK_IDS.join(", ")}
  Leave the stack out and it is detected from your files.

Options:
  --dir <path>   the project folder (default: the current folder)
  --dry-run      show every file and merge that would happen; write nothing
  --print        like --dry-run, and print the content of every file
  --merge        add the CLAUDE.md starter to an existing CLAUDE.md as a marked section (once)
                 instead of writing CLAUDE.starter.md next to it
  --list         list the stacks and what each is detected from
  -h, --help     show this help
  -v, --version  show the version

Never overwrites: existing CLAUDE.md, skills and agents are kept, settings.json is backed up before rules
are merged into it, and .gitignore only gets lines added.
${REPO_URL}`;

/** Command line -> options; anything it does not understand ends up in `errors`. */
export function parseArgs(argv) {
  const args = { stack: null, dir: null, dryRun: false, print: false, merge: false, list: false, help: false, version: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a.startsWith("--dir=")) {
      const value = a === "--dir" ? argv[++i] : a.slice("--dir=".length);
      if (value === undefined || value === "" || value.startsWith("--")) args.errors.push("--dir needs a folder, as in: --dir ../my-project");
      else args.dir = value;
    } else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--print") args.print = true;
    else if (a === "--merge") args.merge = true;
    else if (a === "--list") args.list = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--version" || a === "-v") args.version = true;
    else if (a.startsWith("-")) args.errors.push(`unknown option "${a}"`);
    else if (args.stack === null) args.stack = a;
    else args.errors.push(`one stack at a time (got "${args.stack}" and "${a}")`);
  }
  return args;
}

// The project folder is where .claude/ and CLAUDE.md go. Your home folder is the one place where that
// would be your personal Claude Code config rather than a project's, so it is refused, as is a drive root.
function unsafeFolder(root, home, env) {
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  if (samePath(root, home)) return `${root} is your home folder, where .claude/ holds your personal Claude Code settings, not a project's.`;
  if (path.parse(root).root === root) return `${root} is the root of a drive, not a project folder.`;
  if (isInside(path.resolve(root), path.resolve(configDir))) return `${root} is inside Claude Code's own config folder.`;
  return null;
}

/**
 * Run the command.
 * @param argv    the arguments after the command name
 * @param opts    { cwd, io: { out, err }, home, env }  (all optional; the tests pass their own)
 * @returns the exit code: 0 done, 1 something to fix (bad option, no stack found, settings.json left alone, a write failed)
 */
export function main(argv, { cwd = process.cwd(), io = consoleIO, home = os.homedir(), env = process.env } = {}) {
  const out = (s = "") => io.out(s);
  const err = (s = "") => io.err(s);
  const v = version();
  const args = parseArgs(argv);

  if (args.help) { out(HELP(v)); return 0; }
  if (args.version) { out(v); return 0; }
  if (args.errors.length) {
    for (const e of args.errors) err(`claude-starter: ${e}`);
    err("Run claude-starter --help for the options.");
    return 1;
  }

  const root = path.resolve(cwd, args.dir ?? ".");
  if (!isDir(root)) { err(`claude-starter: ${root} is not a folder.`); return 1; }

  if (args.list) {
    const found = scan(root).map((m) => m.stack);
    out("Stacks (a kit for each; the one found closest to the project root is used when you name none):");
    for (const line of formatStackList(STACKS, found)) out(line);
    return 0;
  }

  let named = null;
  if (args.stack !== null) {
    named = resolveStackName(args.stack);
    if (!named) {
      err(`claude-starter: unknown stack "${args.stack}". Choose one of: ${STACK_IDS.join(", ")}.`);
      return 1;
    }
  }

  const refusal = unsafeFolder(root, home, env);
  if (refusal) { err(`claude-starter: ${refusal} Run it inside a project, or pass --dir <project>.`); return 1; }

  const detection = detect(root, named);
  if (!detection.stack) {
    err(`claude-starter: no project files found in ${root} (looked at the folder and three levels below it).`);
    err("Name a stack to use its kit anyway, or run this in your project folder:");
    for (const line of formatStackList(STACKS)) err(line);
    return 1;
  }
  detection.alternatives = detection.alternatives.map((a) => ({ ...a, stackLabel: stackById(a.stack).label }));

  const facts = gatherFacts(detection.stack, path.join(root, ...detection.rel.split("/")), detection.rel);
  const kit = renderKit(detection.stack, facts.vars);
  const preview = args.dryRun || args.print;
  const actions = buildPlan(root, kit, { merge: args.merge });
  if (!preview) applyPlan(root, actions);

  const report = formatReport({
    version: v, root, detection, label: stackById(detection.stack).label, facts, actions,
    dryRun: args.dryRun || args.print, print: args.print,
  });
  for (const line of report.out) out(line);
  for (const line of report.err) err(line);
  return actions.some((a) => a.kind === "error" || a.failed) ? 1 : 0;
}
