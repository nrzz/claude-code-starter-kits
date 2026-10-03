#!/usr/bin/env node
// claude-starter: a lean, safe .claude/ for your project. All the work lives in src/cli.mjs;
// run `claude-starter --help` for the options.
import { main } from "../src/cli.mjs";

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`claude-starter: unexpected error: ${err && err.stack ? err.stack : err}`);
  console.error("This is a bug; please report it at https://github.com/nrzz/claude-code-starter-kits/issues");
  process.exitCode = 2;
}
