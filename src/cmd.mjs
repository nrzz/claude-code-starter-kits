// A project command is { run, args }. `run` is the part a permission rule matches (the prefix, such as
// "dotnet test" or "npm run lint"); `args` is the rest ("MyApp.sln"). Keeping them apart is what lets the
// permission rules be exact prefixes while CLAUDE.md shows the whole command.

export const cmd = (run, args = "") => ({ run, args });

/** The whole command as typed: "dotnet test MyApp.sln". */
export const cmdText = (c) => (c.args ? `${c.run} ${c.args}` : c.run);

const PLAIN = /^[A-Za-z0-9_@%+=:,./~-]+$/;

/** A shell word: left alone when it needs no quoting, else double-quoted. */
export function shellQuote(s) {
  if (PLAIN.test(s)) return s;
  return `"${String(s).replace(/(["\\$`])/g, "\\$1")}"`;
}

// Names that came from the project's own files end up inside CLAUDE.md, which Claude reads in every
// session, so only plain characters are allowed through: letters, digits, space and . _ @ / + ~ = , -
const SAFE_NAME = /^[\p{L}\p{N} ._@/+~=,-]+$/u;
export const isSafeName = (s) => typeof s === "string" && s.length > 0 && s.length <= 120 && SAFE_NAME.test(s) && s.trim() === s;

/** A project name fit for a title: unsafe characters removed, at most 32 long. "" when nothing is left. */
export function cleanName(s) {
  // whitespace first (a newline becomes a space), then everything outside the safe set is removed
  const kept = String(s ?? "").replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ._@/+~=,-]/gu, "").replace(/ {2,}/g, " ").trim();
  return kept.slice(0, 32).trim();
}
