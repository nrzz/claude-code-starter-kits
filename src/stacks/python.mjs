// Python: pyproject.toml, requirements.txt, setup.py or setup.cfg. uv and poetry projects run their tools
// through `uv run` and `poetry run`; everything else calls the tools directly. Tests are pytest.
import path from "node:path";
import { cleanName, cmd } from "../cmd.mjs";
import { has, read, tomlHasTable, tomlString } from "./util.mjs";

const MARKERS = ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg"];

/** "uv", "poetry" or "pip" (the default): uv.lock or [tool.uv]; poetry.lock or [tool.poetry]. */
export function pythonTool(dir, pyproject) {
  if (has(dir, "uv.lock") || tomlHasTable(pyproject, "tool.uv")) return "uv";
  if (has(dir, "poetry.lock") || tomlHasTable(pyproject, "tool.poetry")) return "poetry";
  return "pip";
}

const PREFIX = { uv: "uv run ", poetry: "poetry run ", pip: "" };

export default {
  id: "python",
  label: "Python",
  about: "uv, poetry or pip, with pytest and ruff",
  markers: "pyproject.toml, requirements.txt, setup.py, setup.cfg",
  match: (files) => files.filter((n) => MARKERS.includes(n)),

  facts({ dir, files }) {
    const pyproject = read(dir, "pyproject.toml") || "";
    const requirements = files.filter((n) => /^requirements[\w.-]*\.txt$/.test(n)).map((n) => read(dir, n) || "").join("\n");
    const declared = `${pyproject}\n${requirements}`;
    const tool = pythonTool(dir, pyproject);
    const p = PREFIX[tool];

    const ruff = tomlHasTable(pyproject, "tool.ruff") || has(dir, "ruff.toml") || has(dir, ".ruff.toml") || /\bruff\b/i.test(declared);
    const black = tomlHasTable(pyproject, "tool.black") || /\bblack\b/i.test(declared);
    const flake8 = has(dir, ".flake8") || /\bflake8\b/i.test(declared);

    const name = tomlString(pyproject, "project", "name") || tomlString(pyproject, "tool.poetry", "name");
    return {
      name: cleanName(name) || cleanName(path.basename(dir)) || "project",
      summary: `${tool}${ruff ? ", ruff" : ""}`,
      commands: {
        build: null, // nothing to build in most Python projects
        test: cmd(`${p}pytest`),
        testOne: cmd(`${p}pytest`, "<file>"),
        lint: ruff ? cmd(`${p}ruff check`, ".") : flake8 ? cmd(`${p}flake8`) : null,
        format: ruff ? cmd(`${p}ruff format`, ".") : black ? cmd(`${p}black`, ".") : null,
        run: has(dir, "manage.py") ? cmd(`${p}python`, "manage.py runserver") : null,
      },
      extras: {
        addDep: tool === "pip" ? "" : `Add dependencies with \`${tool} add\`, never by editing the lockfile.`,
      },
    };
  },
};
