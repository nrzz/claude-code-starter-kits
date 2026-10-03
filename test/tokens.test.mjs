import test from "node:test";
import assert from "node:assert/strict";
import { agentListing, estimateTokens } from "../src/tokens.mjs";
import { parseFrontmatter } from "../src/frontmatter.mjs";
import { cleanName, cmd, cmdText, isSafeName, shellQuote } from "../src/cmd.mjs";

test("estimate: nothing costs nothing", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
});

test("estimate: a word of one to four letters is one token, longer words ceil(length / 4)", () => {
  assert.equal(estimateTokens("a"), 1);
  assert.equal(estimateTokens("test"), 1);
  assert.equal(estimateTokens("build"), 2);
  assert.equal(estimateTokens("dotnet"), 2);
  assert.equal(estimateTokens("dependencies"), 3);
  assert.equal(estimateTokens("FullyQualifiedName"), 5);
});

test("estimate: numbers cost ceil(length / 3)", () => {
  assert.equal(estimateTokens("7"), 1);
  assert.equal(estimateTokens("250"), 1);
  assert.equal(estimateTokens("2026"), 2);
  assert.equal(estimateTokens("1000000"), 3);
});

test("estimate: a run of punctuation is one token", () => {
  assert.equal(estimateTokens("`"), 1);
  assert.equal(estimateTokens("--"), 1);
  assert.equal(estimateTokens("):*"), 1);
  assert.equal(estimateTokens("a--b"), 3);
});

test("estimate: a single space between two pieces is free, any other whitespace run costs one", () => {
  assert.equal(estimateTokens("a b"), 2);
  assert.equal(estimateTokens("a  b"), 3, "a double space");
  assert.equal(estimateTokens("a\nb"), 3, "a newline");
  assert.equal(estimateTokens("a\n\nb"), 3, "a blank line is one run");
  assert.equal(estimateTokens("a\n  b"), 3 , "newline plus indent is one run");
  assert.equal(estimateTokens(" a"), 2, "a leading space is not between two pieces");
  assert.equal(estimateTokens("a "), 2, "nor is a trailing one");
  assert.equal(estimateTokens("a\t"), 2);
});

test("estimate: a real line of a template", () => {
  // "-" "Build" "(2)" ":" "`" "dotnet"(2) "build"(2) "MyApp"(2) "." "sln" "`" newline
  assert.equal(estimateTokens("- Build: `dotnet build MyApp.sln`\n"), 1 + 2 + 1 + 1 + 2 + 2 + 2 + 1 + 1 + 1 + 1);
});

test("estimate: it is deterministic and never below a quarter of the characters", () => {
  const text = "Read files by line range when they are large.\nRun one test file before the whole suite.\n";
  assert.equal(estimateTokens(text), estimateTokens(text));
  assert.ok(estimateTokens(text) >= text.length / 4);
});

test("estimate: letters in other scripts count as letters", () => {
  assert.equal(estimateTokens("café"), 1);
  assert.equal(estimateTokens("naïveté"), 2);
});

test("agent listing: the line Claude Code puts in front of the model", () => {
  assert.equal(agentListing({ name: "a", description: "does x", tools: "Bash, Read" }), "- a: does x (Tools: Bash, Read)");
  assert.equal(agentListing({ name: "a", description: "does x" }), "- a: does x");
});

test("frontmatter: scalars, quotes and booleans", () => {
  const f = parseFrontmatter('---\nname: x\ndescription: "quoted: text"\nflag: true\nother: false\nhint: \'[a]\'\n---\n\nBody\n');
  assert.deepEqual(f.data, { name: "x", description: "quoted: text", flag: true, other: false, hint: "[a]" });
  assert.equal(f.body, "\nBody\n");
  assert.deepEqual(f.errors, []);
});

test("frontmatter: it says so when there is no block, a line is not key: value, or a key repeats", () => {
  assert.match(parseFrontmatter("no block").errors[0], /no frontmatter/);
  assert.match(parseFrontmatter("---\njust text\n---\n").errors[0], /not a "key: value" line/);
  assert.match(parseFrontmatter("---\na: 1\na: 2\n---\n").errors[0], /duplicate key: a/);
});

test("commands: the whole text is the prefix plus its arguments", () => {
  const c = cmd("dotnet test", "App.sln");
  assert.equal(cmdText(c), "dotnet test App.sln");
  assert.equal(c.run, "dotnet test");
  assert.equal(cmdText(cmd("go vet")), "go vet");
});

test("shellQuote: plain words stay, everything else is quoted and escaped", () => {
  assert.equal(shellQuote("src/App.sln"), "src/App.sln");
  assert.equal(shellQuote("My App.sln"), '"My App.sln"');
  assert.equal(shellQuote('a"b'), '"a\\"b"');
  assert.equal(shellQuote("a$b"), '"a\\$b"');
});

test("names from project files: only plain characters get through", () => {
  assert.equal(isSafeName("My App.sln"), true);
  assert.equal(isSafeName("a$b"), false);
  assert.equal(isSafeName("a`b"), false);
  assert.equal(isSafeName("a\nb"), false);
  assert.equal(isSafeName(""), false);
  assert.equal(isSafeName(" lead"), false);
  assert.equal(cleanName("ok-name_1.0"), "ok-name_1.0");
  assert.equal(cleanName("# Ignore this\n`rm -rf`"), "Ignore this rm -rf");
  assert.equal(cleanName("x".repeat(100)).length, 32, "names are cut at 32 characters");
  assert.equal(cleanName("a".repeat(31) + " b"), "a".repeat(31), "and a trailing space is not left behind");
  assert.equal(cleanName(undefined), "");
  assert.equal(cleanName("é-ü"), "é-ü");
});
