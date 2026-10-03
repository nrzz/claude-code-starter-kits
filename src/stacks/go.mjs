// Go: go.mod. Lint is golangci-lint when the project has a config for it, else `go vet`.
import path from "node:path";
import { cleanName, cmd, isSafeName } from "../cmd.mjs";
import { findFiles, has, read } from "./util.mjs";

const GOLANGCI = [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"];

// github.com/acme/orders -> orders; github.com/acme/orders/v2 -> orders
export function moduleName(goMod) {
  const m = /^module\s+("?)(\S+?)\1\s*$/m.exec(goMod || "");
  if (!m) return null;
  const parts = m[2].split("/").filter(Boolean);
  if (parts.length > 1 && /^v\d+$/.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] || null;
}

// `go run .` when the project root is a main package; else the first cmd/<name> that has a main.go.
function runCommand(dir) {
  if (/^package\s+main\b/m.test(read(dir, "main.go") || "")) return cmd("go run", ".");
  const mains = findFiles(path.join(dir, "cmd"), (n) => n === "main.go", { maxDepth: 1 })
    .map((p) => p.split("/")[0]).filter((n) => n !== "main.go" && isSafeName(n));
  return mains.length ? cmd("go run", `./cmd/${mains[0]}`) : null;
}

export default {
  id: "go",
  label: "Go",
  about: "Go modules",
  markers: "go.mod",
  match: (files) => files.filter((n) => n === "go.mod"),

  facts({ dir }) {
    const golangci = GOLANGCI.some((f) => has(dir, f));
    return {
      name: cleanName(moduleName(read(dir, "go.mod"))) || cleanName(path.basename(dir)) || "project",
      summary: golangci ? "golangci-lint configured" : "go vet for lint",
      commands: {
        build: cmd("go build", "./..."),
        test: cmd("go test", "./..."),
        testOne: cmd("go test", "./<pkg> -run <Test>"),
        lint: golangci ? cmd("golangci-lint run") : cmd("go vet", "./..."),
        format: cmd("gofmt", "-w ."),
        run: runCommand(dir),
      },
      extras: {},
    };
  },
};
