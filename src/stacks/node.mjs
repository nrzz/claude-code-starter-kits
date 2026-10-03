// Node.js (TypeScript or JavaScript): package.json. Commands are the project's own package.json scripts, run
// with the package manager its lockfile names. A script that is not there gives no command, and the
// template line that would show it is dropped.
import path from "node:path";
import { cleanName, cmd } from "../cmd.mjs";
import { has, readJson } from "./util.mjs";

// Lockfile -> package manager, in the order that settles a project with more than one lockfile.
const LOCKFILES = [
  ["pnpm", "pnpm-lock.yaml"], ["yarn", "yarn.lock"], ["bun", "bun.lock"], ["bun", "bun.lockb"],
  ["npm", "package-lock.json"], ["npm", "npm-shrinkwrap.json"],
];

/** Lockfile first; the "packageManager" field settles several lockfiles or none; npm when nothing says. */
export function packageManager(dir, pkg) {
  const declared = /^(npm|pnpm|yarn|bun)@/.exec(String(pkg?.packageManager ?? ""))?.[1] ?? null;
  const locked = [...new Set(LOCKFILES.filter(([, file]) => has(dir, file)).map(([pm]) => pm))];
  if (locked.length === 1) return locked[0];
  if (locked.length > 1) return declared && locked.includes(declared) ? declared : locked[0];
  return declared ?? "npm";
}

// The script names whose commands are safe to allow without asking: tests, linting, building, formatting.
// Variants that do not finish by themselves (watch, debug) are left out of the allow rules.
const SAFE_SCRIPT = /^(test|lint|build|typecheck|type-check|check-types|format|fmt)(:[a-z0-9:_-]+)?$/;

const usable = (scripts, name) => typeof scripts[name] === "string" && scripts[name].trim() !== "";
const firstOf = (scripts, names) => names.find((n) => usable(scripts, n)) ?? null;

function frameworks(deps) {
  const found = [];
  if (deps.next) found.push("Next.js");
  else if (deps.react) found.push("React");
  if (deps.express) found.push("Express");
  return found;
}

const FRAMEWORK_NOTE = {
  "Next.js:app": "Next.js: Server Components by default; `'use client'` only if needed.",
  "Next.js": "Next.js: keep server-only code out of client components.",
  React: "React: function components and hooks; keep state local.",
  Express: "Express: thin route handlers; validate input at the edge.",
};

export default {
  id: "node",
  label: "Node.js",
  about: "TypeScript or JavaScript; notes for Next.js, React and Express",
  markers: "package.json",
  match: (files) => files.filter((n) => n === "package.json"),

  facts({ dir, rel }) {
    const { data: pkg, state } = readJson(dir, "package.json");
    const scripts = pkg && pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
    const pm = packageManager(dir, pkg);
    const deps = { ...(pkg?.peerDependencies || {}), ...(pkg?.devDependencies || {}), ...(pkg?.dependencies || {}) };
    const run = (name) => cmd(`${pm} run ${name}`);

    const testScript = usable(scripts, "test") && !/no test specified/i.test(scripts.test) ? "test" : null;
    const typecheck = firstOf(scripts, ["typecheck", "type-check", "check-types"]);
    const dev = firstOf(scripts, ["dev", "start"]);
    const lint = firstOf(scripts, ["lint"]);
    const format = firstOf(scripts, ["format", "fmt"]);
    const build = firstOf(scripts, ["build"]);

    const typescript = !!deps.typescript || has(dir, "tsconfig.json");
    const found = frameworks(deps);
    const nextWithApp = found[0] === "Next.js" && (has(dir, "app") || has(dir, path.join("src", "app")));
    const noteKey = nextWithApp ? "Next.js:app" : found[0];

    const scriptRules = Object.keys(scripts)
      .filter((n) => SAFE_SCRIPT.test(n) && !/watch|debug/.test(n) && usable(scripts, n) && (n !== "test" || testScript))
      .map((n) => `Bash(${pm} run ${n}:*)`);
    if (testScript) scriptRules.push(`Bash(${pm} test:*)`);

    const notes = [];
    if (state === "invalid") notes.push("package.json is not valid JSON, so no scripts were read");
    return {
      name: cleanName(pkg?.name) || cleanName(path.basename(dir)) || "project",
      summary: [typescript ? "TypeScript" : "JavaScript", ...found, pm].join(", "),
      notes,
      commands: {
        build: build && run(build),
        typecheck: typecheck && run(typecheck),
        test: testScript && run("test"),
        // npm needs `--` to pass arguments on to the script; the others forward them as they are
        testOne: testScript && (pm === "npm" ? cmd("npm run test", "-- <file>") : cmd(`${pm} run test`, "<file>")),
        lint: lint && run(lint),
        format: format && run(format),
        run: dev && run(dev),
      },
      extras: {
        tsNote: typescript ? "TypeScript: no `any`; narrow `unknown`." : "",
        frameworkNote: noteKey ? FRAMEWORK_NOTE[noteKey] : "",
        scriptRules,
      },
    };
  },
};
