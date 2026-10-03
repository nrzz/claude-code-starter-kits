// Measures every kit on its sample project (scripts/samples.mjs) and builds the token tables for the README.
//
//   node scripts/token-table.mjs            print the tables
//   node scripts/token-table.mjs --write    put them in README.md, between the token-table markers
//   node scripts/token-table.mjs --check    exit 1 when README.md does not hold exactly these tables
//
// The numbers come from the same code a real run uses: detect the sample, read its commands, render the
// templates, estimate the tokens (src/tokens.mjs). test/readme.test.mjs runs the --check comparison, so the
// README cannot drift from the templates.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect } from "../src/detect.mjs";
import { gatherFacts } from "../src/facts.mjs";
import { parseFrontmatter } from "../src/frontmatter.mjs";
import { renderKit } from "../src/kit.mjs";
import { STACKS } from "../src/stacks/index.mjs";
import { estimateTokens } from "../src/tokens.mjs";
import { SAMPLES, writeSample } from "./samples.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const README = path.join(ROOT, "README.md");
export const START = "<!-- token-table:start -->";
export const END = "<!-- token-table:end -->";

/** One row per stack: what each of its generated files costs, measured on the stack's sample project. */
export function measureAll() {
  return STACKS.map((stack) => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cs-tok-")));
    try {
      writeSample(dir, stack.id);
      const detection = detect(dir);
      const facts = gatherFacts(detection.stack, path.join(dir, ...detection.rel.split("/")), detection.rel);
      const kit = renderKit(detection.stack, facts.vars);
      const bodyOf = (name) => estimateTokens(parseFrontmatter(kit.files.find((f) => f.path.includes(name)).text).body);
      const claudeMd = estimateTokens(kit.claudeMd);
      return {
        id: stack.id,
        label: stack.label,
        sample: SAMPLES[stack.id].about,
        claudeMd,
        agentList: kit.agent.tokens,
        perSession: claudeMd + kit.agent.tokens,
        test: bodyOf("skills/test"),
        check: bodyOf("skills/check"),
        agentPrompt: bodyOf("agents/"),
      };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

/** The markdown between the README markers, without the markers. */
export function buildTables(rows = measureAll()) {
  const every = [
    "| Stack | `CLAUDE.md` | `test-runner` in the agent list | Total in every session | Skills in the skill list |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows.map((r) => `| ${r.label} | ${r.claudeMd} | ${r.agentList} | **${r.perSession}** | 0 |`),
  ];
  const used = [
    "| Stack | `/test` | `/check` | `test-runner` prompt (runs on Haiku) |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map((r) => `| ${r.label} | ${r.test} | ${r.check} | ${r.agentPrompt} |`),
  ];
  const samples = rows.map((r) => `${r.label}: ${r.sample}`).join("; ");
  return [
    "In every session (estimated tokens):",
    "",
    ...every,
    "",
    "Only when you use it (estimated tokens; each is a one-off, not a per-turn cost):",
    "",
    ...used,
    "",
    `Measured on a sample project per stack with every command present, so they are close to the most a typical project costs; a long solution or project name adds a few tokens. Samples: ${samples}.`,
  ].join("\n");
}

/** README text with the block between the markers replaced. */
export function withTables(readme, tables) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error(`README.md needs ${START} and ${END}`);
  return `${readme.slice(0, a + START.length)}\n${tables}\n${readme.slice(b)}`;
}

/** The block between the markers as it is now in `readme`. */
export function currentTables(readme) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) return null;
  return readme.slice(a + START.length, b).replace(/^\n|\n$/g, "");
}

function cli(argv) {
  const tables = buildTables();
  const readmeText = () => fs.readFileSync(README, "utf8").replace(/\r\n/g, "\n");
  if (argv.includes("--write")) {
    fs.writeFileSync(README, withTables(readmeText(), tables));
    console.log("README.md token tables updated.");
  } else if (argv.includes("--check")) {
    if (currentTables(readmeText()) === tables) console.log("README.md token tables are up to date.");
    else { console.error("README.md token tables are out of date. Run: node scripts/token-table.mjs --write"); process.exitCode = 1; }
  } else {
    console.log(tables);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) cli(process.argv.slice(2));
