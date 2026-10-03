import test from "node:test";
import assert from "node:assert/strict";
import { renderJson, renderText } from "../src/render.mjs";
import { parseFrontmatter } from "../src/frontmatter.mjs";

test("text: placeholders are replaced", () => {
  assert.equal(renderText("# {{name}}\nRun `{{test}}` now.\n", { name: "app", test: "npm test" }), "# app\nRun `npm test` now.\n");
});

test("text: a placeholder may appear twice on a line", () => {
  assert.equal(renderText("{{a}} and {{a}}\n", { a: "x" }), "x and x\n");
});

test("text: a line whose placeholder is empty is dropped (empty string, null, undefined, empty list)", () => {
  for (const empty of ["", null, undefined, []]) {
    assert.equal(renderText("keep\n- Lint: `{{lint}}`\nalso keep\n", { lint: empty }), "keep\nalso keep\n", JSON.stringify(empty));
  }
});

test("text: one empty placeholder drops the whole line, even if another one is filled", () => {
  assert.equal(renderText("{{a}} {{b}}\nrest\n", { a: "x", b: "" }), "rest\n");
});

test("text: lines without placeholders are kept as they are", () => {
  assert.equal(renderText("plain {text} with { braces }\n", {}), "plain {text} with { braces }\n");
});

test("text: a placeholder the values do not define stops rendering and names the file", () => {
  assert.throws(() => renderText("{{typo}}\n", { name: "x" }, "kits/node/CLAUDE.md"), /kits\/node\/CLAUDE\.md: unknown placeholder \{\{typo\}\}/);
});

test("text: a placeholder that is defined but empty is not an error", () => {
  assert.doesNotThrow(() => renderText("{{a}}\n", { a: "" }));
});

test("text: a heading with nothing under it is dropped", () => {
  const tpl = "# T\n\n## Commands\n- Build: `{{build}}`\n\n## Conventions\n- one\n";
  assert.equal(renderText(tpl, { build: "" }), "# T\n\n## Conventions\n- one\n");
  assert.equal(renderText(tpl, { build: "make" }), "# T\n\n## Commands\n- Build: `make`\n\n## Conventions\n- one\n");
});

test("text: a heading at the end with nothing under it is dropped", () => {
  assert.equal(renderText("# T\n\n## Last\n- {{x}}\n", { x: "" }), "# T\n");
});

test("text: a title followed by deeper headings is kept", () => {
  assert.equal(renderText("# T\n\n## A\n- a\n", {}), "# T\n\n## A\n- a\n");
});

test("text: blank lines collapse, trailing spaces go, and the file ends with one newline", () => {
  assert.equal(renderText("a  \n\n\n\nb\n\n\n", {}), "a\n\nb\n");
  assert.equal(renderText("\n\nstart\n", {}), "start\n");
});

test("text: CRLF templates are rendered with LF", () => {
  assert.equal(renderText("a\r\n{{x}}\r\n", { x: "b" }), "a\nb\n");
});

test("text: frontmatter lines drop like any other, and the block stays valid", () => {
  const tpl = "---\nname: test\nallowed-tools: {{allow}}\n---\n\nBody\n";
  const out = renderText(tpl, { allow: "" });
  assert.equal(out, "---\nname: test\n---\n\nBody\n");
  assert.deepEqual(parseFrontmatter(out).errors, []);
});

test("json: placeholders inside strings are replaced", () => {
  assert.deepEqual(renderJson('{"a": ["Bash({{cmd}}:*)"]}', { cmd: "npm run test" }), { a: ["Bash(npm run test:*)"] });
});

test("json: a string whose placeholder is empty is dropped from its array", () => {
  assert.deepEqual(renderJson('["Bash({{a}}:*)", "Bash({{b}}:*)", "fixed"]', { a: "x", b: "" }), ["Bash(x:*)", "fixed"]);
});

test("json: an object key whose value is an empty placeholder is dropped", () => {
  assert.deepEqual(renderJson('{"keep": "k", "gone": "{{x}}"}', { x: "" }), { keep: "k" });
});

test('json: an element that is exactly "{{list}}" is replaced by the list\'s items', () => {
  assert.deepEqual(renderJson('["first", "{{rules}}", "last"]', { rules: ["a", "b"] }), ["first", "a", "b", "last"]);
});

test("json: an empty list splices to nothing", () => {
  assert.deepEqual(renderJson('["first", "{{rules}}"]', { rules: [] }), ["first"]);
});

test("json: nested structures are walked, and other value types are left alone", () => {
  const out = renderJson('{"p": {"allow": ["{{r}}"], "n": 3, "t": true, "z": null}}', { r: "x" });
  assert.deepEqual(out, { p: { allow: ["x"], n: 3, t: true, z: null } });
});

test("json: an unknown placeholder or invalid JSON stops rendering and names the file", () => {
  assert.throws(() => renderJson('["{{nope}}"]', {}, "kits/x/settings.json"), /kits\/x\/settings\.json: unknown placeholder/);
  assert.throws(() => renderJson("[1,", {}, "kits/x/settings.json"), /kits\/x\/settings\.json: not valid JSON/);
});
