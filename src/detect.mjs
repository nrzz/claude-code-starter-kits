// Which stack is this project? Look for marker files (go.mod, package.json, *.sln, ...) in the project
// folder and a few levels below it. The match closest to the root wins; a tie in the same folder is settled
// by TIE_ORDER; the other stacks that were found are reported as alternatives.
import path from "node:path";
import { isSafeName } from "./cmd.mjs";
import { listDir, toPosix } from "./fsutil.mjs";
import { STACKS, TIE_ORDER } from "./stacks/index.mjs";
import { isIgnoredDir } from "./stacks/util.mjs";

const MAX_DEPTH = 3; // folders below the project root that are searched
const MAX_DIRS = 2000; // a safety stop for huge trees

// Folders worth searching: not generated output, and named plainly enough to appear in a generated file.
const searchable = (name) => !isIgnoredDir(name) && isSafeName(name);

/**
 * Every folder (at most MAX_DEPTH deep) that holds a marker file of some stack, closest to the root first.
 * @returns [{ stack, rel, depth, markers }]  rel is "." or a forward-slash path from the root
 */
export function scan(root) {
  const matches = [];
  const queue = [{ abs: root, rel: ".", depth: 0 }];
  for (let seen = 0; queue.length && seen < MAX_DIRS; seen++) {
    const { abs, rel, depth } = queue.shift();
    const entries = listDir(abs).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const files = entries.filter((e) => !e.isDirectory()).map((e) => e.name);
    for (const s of STACKS) {
      const markers = s.match(files);
      if (markers.length) matches.push({ stack: s.id, rel, depth, markers });
    }
    if (depth < MAX_DEPTH) {
      for (const e of entries) {
        if (e.isDirectory() && searchable(e.name)) queue.push({ abs: path.join(abs, e.name), rel: rel === "." ? e.name : `${rel}/${e.name}`, depth: depth + 1 });
      }
    }
  }
  return matches;
}

const byCloseness = (a, b) =>
  a.depth - b.depth || TIE_ORDER.indexOf(a.stack) - TIE_ORDER.indexOf(b.stack) || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);

// A Flutter or React Native project carries a Gradle build in its android/ folder, which is not a second project.
function isNativeShell(m, pick) {
  if (m.stack !== "java" || (pick.stack !== "flutter" && pick.stack !== "node")) return false;
  const android = pick.rel === "." ? "android" : `${pick.rel}/android`;
  return m.rel === android || m.rel.startsWith(`${android}/`);
}

// One match for each stack other than the pick (its closest), in the order they would have been chosen.
function alternativesTo(pick, sorted) {
  const out = [];
  for (const m of sorted) {
    if (m.stack === pick.stack || isNativeShell(m, pick) || out.some((a) => a.stack === m.stack)) continue;
    out.push(m);
  }
  return out;
}

/**
 * The stack to use and the others that were found.
 * @returns { pick, alternatives }  pick is null when nothing matched; alternatives hold one match per other stack
 */
export function pickStack(matches) {
  const sorted = [...matches].sort(byCloseness);
  const pick = sorted[0] ?? null;
  return { pick, alternatives: pick ? alternativesTo(pick, sorted) : [] };
}

/**
 * Settle on a stack for `root`.
 * @param explicitId a stack id the user named, or null to detect
 * @returns { stack, rel, markers, how, alternatives }  how: "detected" | "named" | "named, no marker files found"
 *          stack is null when nothing was detected and none was named
 */
export function detect(root, explicitId = null) {
  const matches = scan(root);
  if (explicitId) {
    const sorted = [...matches].sort(byCloseness);
    const mine = sorted.find((m) => m.stack === explicitId);
    const others = alternativesTo(mine ?? { stack: explicitId, rel: ".", depth: 0 }, sorted);
    return mine
      ? { stack: explicitId, rel: mine.rel, markers: mine.markers, how: "named", alternatives: others }
      : { stack: explicitId, rel: ".", markers: [], how: "named, no marker files found", alternatives: others };
  }
  const { pick, alternatives } = pickStack(matches);
  if (!pick) return { stack: null, rel: ".", markers: [], how: "none", alternatives: [] };
  return { stack: pick.stack, rel: pick.rel, markers: pick.markers, how: "detected", alternatives };
}

// File names come from the project being looked at, which may be a clone of something untrusted: control
// characters (a terminal escape sequence in a file name) are replaced before a name is printed.
const printable = (s) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, "?");

/** "server/Api.csproj" style description of where a match was found. */
export const describeMatch = (m) => m.markers.map((f) => printable(m.rel === "." ? f : toPosix(`${m.rel}/${f}`))).join(", ");

