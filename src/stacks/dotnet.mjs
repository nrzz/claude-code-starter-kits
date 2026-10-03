// .NET: a solution (.sln or .slnx) or a project (.csproj, .fsproj).
// Commands run from the project root with the solution's path, so a solution in src/ needs no `cd`.
import path from "node:path";
import { cleanName, cmd, isSafeName, shellQuote } from "../cmd.mjs";
import { findFiles, read, underRoot } from "./util.mjs";

const SOLUTION = /\.(sln|slnx)$/i;
const PROJECT = /\.(csproj|fsproj)$/i;
const baseOf = (file) => file.replace(/\.[^.]+$/, "");

// With several solutions, the one named like its folder; else the first by name.
function pickSolution(solutions, dirName) {
  if (solutions.length <= 1) return solutions[0] ?? null;
  return solutions.find((s) => baseOf(s).toLowerCase() === dirName.toLowerCase()) ?? solutions[0];
}

// The project `dotnet run` should start: a web project first, else the first executable that is not a test.
function runnableProject(dir) {
  const projects = findFiles(dir, (n) => PROJECT.test(n)).filter((p) => p.split("/").every(isSafeName));
  const texts = projects.map((p) => ({ path: p, text: read(dir, p) || "" }))
    .filter((p) => !/Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true/i.test(p.text));
  const web = texts.find((p) => /Sdk="Microsoft\.NET\.Sdk\.Web"/i.test(p.text));
  const exe = texts.find((p) => /<OutputType>\s*(Exe|WinExe)\s*<\/OutputType>/i.test(p.text));
  return (web || exe)?.path ?? null;
}

export default {
  id: "dotnet",
  label: ".NET",
  about: ".NET solutions and projects (C# and F#)",
  markers: "*.sln, *.slnx, *.csproj, *.fsproj",
  match: (files) => files.filter((n) => SOLUTION.test(n) || PROJECT.test(n)),

  facts({ dir, rel, files }) {
    const dirName = path.basename(dir);
    const solutions = files.filter((n) => SOLUTION.test(n) && isSafeName(n)).sort();
    const projects = files.filter((n) => PROJECT.test(n) && isSafeName(n)).sort();
    const solution = pickSolution(solutions, dirName);
    const target = solution ?? (projects.length === 1 ? projects[0] : null);
    const arg = target ? shellQuote(underRoot(rel, target)) : "";
    const withTarget = (...more) => [arg, ...more].filter(Boolean).join(" ");

    const runProject = runnableProject(dir);
    return {
      name: cleanName(target ? baseOf(target) : dirName) || cleanName(dirName) || "project",
      summary: solutions.length > 1 ? `${solution} chosen of ${solutions.length} solutions`
        : target ? "" : "no single solution or project file, so the commands have no path",
      cwd: ".", // paths above are already relative to the project root
      commands: {
        build: cmd("dotnet build", withTarget()),
        test: cmd("dotnet test", withTarget()),
        testOne: cmd("dotnet test", withTarget('--filter "FullyQualifiedName~<name>"')),
        lint: cmd("dotnet format", withTarget("--verify-no-changes")),
        format: cmd("dotnet format", withTarget()),
        run: runProject ? cmd("dotnet run", `--project ${shellQuote(underRoot(rel, runProject))}`) : null,
      },
      extras: {},
    };
  },
};
