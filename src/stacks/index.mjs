// The stacks, in the order they are listed.
import dotnet from "./dotnet.mjs";
import node from "./node.mjs";
import python from "./python.mjs";
import go from "./go.mjs";
import flutter from "./flutter.mjs";
import java from "./java.mjs";

export const STACKS = [dotnet, node, python, go, flutter, java];
export const STACK_IDS = STACKS.map((s) => s.id);
export const stackById = (id) => STACKS.find((s) => s.id === id) ?? null;

// When two stacks have a marker in the same folder, the first of these wins. package.json comes last
// because many projects that are not Node projects have one just for tooling (prettier, commitlint, ...).
export const TIE_ORDER = ["dotnet", "java", "go", "flutter", "python", "node"];

// Other names people type for a stack.
const ALIASES = {
  csharp: "dotnet", "c#": "dotnet", ".net": "dotnet",
  js: "node", ts: "node", javascript: "node", typescript: "node", nodejs: "node", npm: "node",
  py: "python", golang: "go", dart: "flutter",
};

/** A stack id from what the user typed, or null. */
export function resolveStackName(input) {
  const key = String(input ?? "").trim().toLowerCase();
  if (STACK_IDS.includes(key)) return key;
  return ALIASES[key] ?? null;
}
