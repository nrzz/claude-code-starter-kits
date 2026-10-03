import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { countRules, formatSettings, mergeSettings, readSettings, styleOf } from "../src/settings.mjs";
import { timestamp, uniquePath } from "../src/fsutil.mjs";
import { project } from "./helpers.mjs";

const wanted = (allow = [], deny = []) => ({ permissions: { allow, deny } });

// readSettings of a file holding `text` (or of no file, with null).
function read(text) {
  const proj = project(text === null ? {} : { "settings.json": text });
  try { return readSettings(proj.p("settings.json")); } finally { proj.cleanup(); }
}

test("read: no file is missing, and reading never creates it", () => {
  const proj = project({});
  try {
    const r = readSettings(proj.p("settings.json"));
    assert.equal(r.status, "missing");
    assert.deepEqual(r.data, {});
    assert.equal(proj.has("settings.json"), false);
  } finally { proj.cleanup(); }
});

test("read: an empty or whitespace-only file counts as an empty object", () => {
  assert.deepEqual(read("").data, {});
  assert.equal(read("  \n").status, "ok");
});

test("read: a byte order mark is ignored", () => {
  const BOM = String.fromCharCode(0xfeff);
  const r = read(BOM + JSON.stringify({ model: "opus" }));
  assert.equal(r.status, "ok");
  assert.equal(r.data.model, "opus");
});

test("read: a valid object is ok and keeps the raw text", () => {
  const text = '{\n  "model": "opus"\n}\n';
  const r = read(text);
  assert.equal(r.status, "ok");
  assert.equal(r.raw, text);
});

test("read: invalid JSON, a non-object, and a malformed permissions section are all 'invalid' with a reason", () => {
  assert.deepEqual([read("{ nope").status, read("{ nope").reason], ["invalid", "is not valid JSON"]);
  assert.equal(read("[]").reason, "is not a JSON object");
  assert.equal(read("null").status, "invalid");
  assert.equal(read('"text"').status, "invalid");
  assert.equal(read('{"permissions": []}').reason, '"permissions" is not an object');
  assert.equal(read('{"permissions": {"allow": "Bash(ls)"}}').reason, '"permissions.allow" is not a list');
  assert.equal(read('{"permissions": {"deny": {}}}').reason, '"permissions.deny" is not a list');
  assert.equal(read('{"permissions": {"ask": 3}}').reason, '"permissions.ask" is not a list');
});

test("merge: rules are added to an empty settings object", () => {
  const m = mergeSettings({}, wanted(["a"], ["d"]));
  assert.deepEqual(m.merged, { permissions: { allow: ["a"], deny: ["d"] } });
  assert.deepEqual(m.added, { allow: ["a"], deny: ["d"], ask: [] });
  assert.equal(m.changed, true);
});

test("merge: every other key, and every other key inside permissions, is left as it was", () => {
  const existing = {
    model: "opus",
    env: { FOO: "1" },
    hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }] },
    permissions: { defaultMode: "acceptEdits", additionalDirectories: ["../shared"], allow: ["Bash(ls:*)"] },
  };
  const before = JSON.stringify(existing);
  const m = mergeSettings(existing, wanted(["Bash(git status)"], ["Read(./.env)"]));
  assert.equal(JSON.stringify(existing), before, "the input is not modified");
  assert.deepEqual(m.merged.env, { FOO: "1" });
  assert.equal(m.merged.model, "opus");
  assert.deepEqual(m.merged.hooks, existing.hooks);
  assert.equal(m.merged.permissions.defaultMode, "acceptEdits");
  assert.deepEqual(m.merged.permissions.additionalDirectories, ["../shared"]);
  assert.deepEqual(m.merged.permissions.allow, ["Bash(ls:*)", "Bash(git status)"], "theirs first, ours after");
  assert.deepEqual(m.merged.permissions.deny, ["Read(./.env)"]);
});

test("merge: key order is kept, and permissions is added last when it was missing", () => {
  const m = mergeSettings({ z: 1, a: 2 }, wanted(["x"]));
  assert.deepEqual(Object.keys(m.merged), ["z", "a", "permissions"]);
});

test("merge: a rule already in the same list is not added twice, and nothing changes when all are there", () => {
  const existing = { permissions: { allow: ["a", "b"], deny: ["d"] } };
  const m = mergeSettings(existing, wanted(["b", "a"], ["d"]));
  assert.equal(m.changed, false);
  assert.equal(m.merged, existing, "the very same object comes back");
  assert.deepEqual(m.kept, []);
});

test("merge: rules are de-duplicated within what is wanted, too", () => {
  const m = mergeSettings({}, wanted(["a", "a", "b"]));
  assert.deepEqual(m.merged.permissions.allow, ["a", "b"]);
});

test("merge: a rule the user keeps in another list stays there, and is reported", () => {
  const existing = { permissions: { allow: ["Bash(git push --force:*)"], ask: ["Bash(npm publish:*)"] } };
  const m = mergeSettings(existing, wanted(["Bash(npm publish:*)", "new"], ["Bash(git push --force:*)", "Bash(npm publish:*)"]));
  assert.deepEqual(m.merged.permissions.allow, ["Bash(git push --force:*)", "new"]);
  assert.equal(m.merged.permissions.deny, undefined, "no deny list was created for rules that were refused");
  assert.deepEqual(m.kept, [
    { rule: "Bash(npm publish:*)", list: "ask", wanted: "allow" },
    { rule: "Bash(git push --force:*)", list: "allow", wanted: "deny" },
    { rule: "Bash(npm publish:*)", list: "ask", wanted: "deny" },
  ]);
});

test("merge: the user's ask list and unknown permission lists are preserved", () => {
  const existing = { permissions: { ask: ["Bash(rm:*)"] } };
  const m = mergeSettings(existing, wanted(["a"]));
  assert.deepEqual(m.merged.permissions.ask, ["Bash(rm:*)"]);
});

test("style: indent, line ending and final newline of the existing file", () => {
  assert.deepEqual(styleOf('{\n  "a": 1\n}\n'), { indent: 2, eol: "\n", finalNewline: true });
  assert.deepEqual(styleOf('{\n    "a": 1\n}\n'), { indent: 4, eol: "\n", finalNewline: true });
  assert.deepEqual(styleOf('{\n\t"a": 1\n}'), { indent: "\t", eol: "\n", finalNewline: false });
  assert.deepEqual(styleOf('{\r\n  "a": 1\r\n}\r\n'), { indent: 2, eol: "\r\n", finalNewline: true });
  assert.deepEqual(styleOf('{"a":1}'), { indent: 2, eol: "\n", finalNewline: false });
  assert.deepEqual(styleOf(null), { indent: 2, eol: "\n", finalNewline: true });
  assert.deepEqual(styleOf("  "), { indent: 2, eol: "\n", finalNewline: true });
});

test("format: the merged file is written the way it was", () => {
  const data = { a: { b: 1 } };
  assert.equal(formatSettings(data), '{\n  "a": {\n    "b": 1\n  }\n}\n');
  assert.equal(formatSettings(data, { indent: 4, eol: "\n", finalNewline: true }), '{\n    "a": {\n        "b": 1\n    }\n}\n');
  assert.equal(formatSettings(data, { indent: "\t", eol: "\n", finalNewline: false }), '{\n\t"a": {\n\t\t"b": 1\n\t}\n}');
  assert.equal(formatSettings(data, { indent: 2, eol: "\r\n", finalNewline: true }), '{\r\n  "a": {\r\n    "b": 1\r\n  }\r\n}\r\n');
});

test("format: what formatSettings writes reads back the same", () => {
  const data = { permissions: { allow: ["Bash(a b:*)"], deny: [] }, n: 3 };
  assert.deepEqual(JSON.parse(formatSettings(data)), data);
});

test("countRules adds up all three lists", () => {
  assert.equal(countRules({ allow: ["a", "b"], deny: ["c"], ask: [] }), 3);
  assert.equal(countRules({}), 0);
});

test("backup names: a timestamp, and a number added when the name is taken", () => {
  assert.match(timestamp(new Date(2026, 9, 4, 10, 5, 9)), /^20261004-100509$/);
  const proj = project({ "f.bak": "x" });
  try {
    assert.equal(uniquePath(proj.p("g.bak")), proj.p("g.bak"));
    assert.equal(uniquePath(proj.p("f.bak")), `${proj.p("f.bak")}-1`);
    fs.writeFileSync(`${proj.p("f.bak")}-1`, "y");
    assert.equal(uniquePath(proj.p("f.bak")), `${proj.p("f.bak")}-2`);
  } finally { proj.cleanup(); }
});
