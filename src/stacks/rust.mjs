// Rust: Cargo.toml packages and workspaces.
import path from "node:path";
import { cleanName, cmd } from "../cmd.mjs";
import { findFiles, has, read, tomlHasTable, tomlString } from "./util.mjs";

/** Package name from `[package] name = "..."` */
export function crateName(cargoToml) {
  return tomlString(cargoToml, "package", "name");
}

/** Array of member paths from `[workspace] members = [...]` or null when not a workspace */
export function workspaceMembers(cargoToml) {
  const src = String(cargoToml || "");
  const head = /^[ \t]*\[workspace\][ \t]*(#.*)?$/m.exec(src);
  if (!head) return null;
  const rest = src.slice(head.index + head[0].length);
  const next = /^[ \t]*\[/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  const m = /^[ \t]*members[ \t]*=[ \t]*\[([\s\S]*?)\]/m.exec(body);
  if (!m) return [];
  const items = [];
  const re = /["']([^"'\\n]+)["']/g;
  let match;
  while ((match = re.exec(m[1])) !== null) {
    items.push(match[1]);
  }
  return items;
}

// `cargo run` when there is a binary target (src/main.rs, [[bin]], or src/bin/*.rs)
function runCommand(dir, cargoToml) {
  if (has(dir, "src/main.rs") || /^[ \t]*\[\[?bin[\]\.]/m.test(cargoToml)) return cmd("cargo run");
  const binFiles = findFiles(path.join(dir, "src/bin"), (n) => n.endsWith(".rs"), { maxDepth: 1 });
  return binFiles.length > 0 ? cmd("cargo run") : null;
}

export default {
  id: "rust",
  label: "Rust",
  about: "Cargo packages and workspaces",
  markers: "Cargo.toml",
  match: (files) => files.filter((n) => n === "Cargo.toml"),

  facts({ dir }) {
    const cargoToml = read(dir, "Cargo.toml") || "";
    const isWorkspace = tomlHasTable(cargoToml, "workspace");
    const members = isWorkspace ? (workspaceMembers(cargoToml) ?? []) : [];
    const name = cleanName(crateName(cargoToml)) || cleanName(path.basename(dir)) || "project";

    return {
      name,
      summary: isWorkspace
        ? members.length > 0
          ? members.length === 1
            ? "workspace (1 member)"
            : `workspace (${members.length} members)`
          : "workspace"
        : "",
      commands: {
        build: cmd("cargo build"),
        test: cmd("cargo test"),
        testOne: cmd("cargo test", "<test>"),
        lint: cmd("cargo clippy", "--all-targets -- -D warnings"),
        format: cmd("cargo fmt", "--check"),
        run: runCommand(dir, cargoToml),
      },
      extras: {},
    };
  },
};
