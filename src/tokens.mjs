// Token estimates. This is a rule of thumb, not a tokenizer. It is built to err high (every run of punctuation
// is a token, a long word is several), so real counts are expected to come out lower than the estimate. It has
// not been checked against Claude's own tokenizer: treat the numbers as a budget to stay under, not as a bill.
//
// The text is cut into runs of letters, runs of digits, runs of whitespace and runs of everything else
// (punctuation and symbols). What each run costs:
//   letters      ceil(length / 4)   so a word of 1 to 4 letters is one token, "FullyQualifiedName" is five
//   digits       ceil(length / 3)   tokenizers split numbers into groups of up to three digits
//   punctuation  1 per run          "`", ":" and "--" are one each; "):" is one run, so one token
//   whitespace   1 per run, except a single space between two other pieces, which is free:
//                tokenizers fold that space into the word after it. A newline, an indent or a double
//                space is one token.
//
// Written for English text and code (the templates here); it is not meant for other scripts.

/** The most tokens a generated CLAUDE.md should cost in every session. The kits are written to fit with room to spare. */
export const CLAUDE_MD_BUDGET = 250;

const RUNS = /(\p{L}+)|(\p{N}+)|(\s+)|([^\p{L}\p{N}\s]+)/gu;

/** Estimated tokens in `text`. */
export function estimateTokens(text) {
  const runs = [...String(text ?? "").matchAll(RUNS)];
  let total = 0;
  runs.forEach((m, i) => {
    const [piece, letters, digits, space] = m;
    if (letters) total += Math.ceil(piece.length / 4);
    else if (digits) total += Math.ceil(piece.length / 3);
    else if (space) {
      const between = i > 0 && i < runs.length - 1;
      if (!(piece === " " && between)) total += 1;
    } else total += 1;
  });
  return total;
}

/**
 * The line Claude Code puts in front of the model for a subagent, which is what an agent costs in every
 * session: its name, description and tools. The agent's prompt (its body) is read only when it runs.
 */
export function agentListing({ name, description, tools }) {
  return `- ${name}: ${description}${tools ? ` (Tools: ${tools})` : ""}`;
}
