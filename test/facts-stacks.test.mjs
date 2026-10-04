import test from "node:test";
import assert from "node:assert/strict";
import { gatherFacts } from "../src/facts.mjs";
import { artifactId, gradleRootName } from "../src/stacks/java.mjs";
import { moduleName } from "../src/stacks/go.mjs";
import { pythonTool } from "../src/stacks/python.mjs";
import { tomlHasTable, tomlString } from "../src/stacks/util.mjs";
import { project } from "./helpers.mjs";

function facts(stack, files, rel = ".") {
  const proj = project(files);
  try { return gatherFacts(stack, rel === "." ? proj.dir : proj.p(rel), rel); } finally { proj.cleanup(); }
}

// ----------------------------------------------------------------------------------------- dotnet

const WEB = '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>';
const EXE = "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>";
const LIB = '<Project Sdk="Microsoft.NET.Sdk"></Project>';

test("dotnet: the solution name fills every command", () => {
  const v = facts("dotnet", { "Shop.sln": "" }).vars;
  assert.equal(v.name, "Shop");
  assert.equal(v.build, "dotnet build Shop.sln");
  assert.equal(v.test, "dotnet test Shop.sln");
  assert.equal(v.testOne, 'dotnet test Shop.sln --filter "FullyQualifiedName~<name>"');
  assert.equal(v.lint, "dotnet format Shop.sln --verify-no-changes");
  assert.equal(v.format, "dotnet format Shop.sln");
  assert.equal(v.buildRule, "dotnet build");
  assert.equal(v.testRule, "dotnet test");
  assert.equal(v.lintRule, "dotnet format");
});

test("dotnet: .slnx works like .sln", () => {
  assert.equal(facts("dotnet", { "Shop.slnx": "" }).vars.build, "dotnet build Shop.slnx");
});

test("dotnet: with several solutions the one named like the folder wins, else the first", () => {
  const proj = project({ "A.sln": "", "B.sln": "" });
  try {
    assert.equal(gatherFacts("dotnet", proj.dir, ".").vars.build, "dotnet build A.sln");
  } finally { proj.cleanup(); }
  const named = project({});
  try {
    const base = named.dir.split(/[\\/]/).pop();
    named.write(`${base}.sln`, "");
    named.write("Aaa.sln", "");
    assert.equal(gatherFacts("dotnet", named.dir, ".").vars.build, `dotnet build ${base}.sln`);
  } finally { named.cleanup(); }
});

test("dotnet: no solution but one project file", () => {
  const v = facts("dotnet", { "Tool.csproj": LIB }).vars;
  assert.equal(v.build, "dotnet build Tool.csproj");
  assert.equal(v.name, "Tool");
});

test("dotnet: several project files and no solution give commands without a path", () => {
  const v = facts("dotnet", { "A.csproj": LIB, "B.csproj": LIB }).vars;
  assert.equal(v.build, "dotnet build");
  assert.equal(v.test, "dotnet test");
});

test("dotnet: a solution name with a space is quoted", () => {
  const v = facts("dotnet", { "My App.sln": "" }).vars;
  assert.equal(v.build, 'dotnet build "My App.sln"');
  assert.equal(v.name, "My App");
});

test("dotnet: a name with shell characters is ignored rather than quoted into CLAUDE.md", () => {
  const v = facts("dotnet", { "a$b.sln": "" }).vars;
  assert.equal(v.build, "dotnet build");
});

test("dotnet: a solution in a sub-folder is named by its path from the project root", () => {
  const f = facts("dotnet", { "src/App.sln": "" }, "src");
  assert.equal(f.vars.build, "dotnet build src/App.sln");
  assert.equal(f.vars.where, "", "paths are relative to the project root, so nothing says where to run");
});

test("dotnet: run starts the web project, else the first executable, never a test project or a library", () => {
  const tests = '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /></ItemGroup><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>';
  assert.equal(facts("dotnet", { "A.sln": "", "src/Web/Web.csproj": WEB, "src/Cli/Cli.csproj": EXE }).vars.run, "dotnet run --project src/Web/Web.csproj");
  assert.equal(facts("dotnet", { "A.sln": "", "src/Cli/Cli.csproj": EXE, "src/Lib/Lib.csproj": LIB }).vars.run, "dotnet run --project src/Cli/Cli.csproj");
  assert.equal(facts("dotnet", { "A.sln": "", "tests/T/T.csproj": tests }).vars.run, "");
  assert.equal(facts("dotnet", { "A.sln": "", "src/Lib/Lib.csproj": LIB }).vars.run, "");
});

test("dotnet: the name is the folder name when there is nothing to name it by", () => {
  assert.match(facts("dotnet", { "README.md": "x" }).vars.name, /^cs-/);
});

// ------------------------------------------------------------------------------------------ python

test("python: uv from uv.lock or [tool.uv]", () => {
  assert.equal(facts("python", { "pyproject.toml": "[project]\nname='x'\n", "uv.lock": "" }).vars.test, "uv run pytest");
  assert.equal(facts("python", { "pyproject.toml": "[tool.uv]\ndev-dependencies=[]\n" }).vars.test, "uv run pytest");
});

test("python: poetry from poetry.lock or [tool.poetry]", () => {
  assert.equal(facts("python", { "pyproject.toml": "[project]\n", "poetry.lock": "" }).vars.test, "poetry run pytest");
  assert.equal(facts("python", { "pyproject.toml": '[tool.poetry]\nname = "x"\n' }).vars.test, "poetry run pytest");
});

test("python: pip (the default) calls the tools directly", () => {
  const v = facts("python", { "requirements.txt": "pytest\nruff\n" }).vars;
  assert.equal(v.test, "pytest");
  assert.equal(v.testOne, "pytest <file>");
  assert.equal(v.lint, "ruff check .");
  assert.equal(v.format, "ruff format .");
});

test("python: uv wins over poetry when both are present", () => {
  const proj = project({ "uv.lock": "", "poetry.lock": "", "pyproject.toml": "" });
  try { assert.equal(pythonTool(proj.dir, ""), "uv"); } finally { proj.cleanup(); }
});

test("python: ruff from its table, its config file or a requirements entry", () => {
  assert.equal(facts("python", { "pyproject.toml": "[tool.ruff]\nline-length=100\n" }).vars.lint, "ruff check .");
  assert.equal(facts("python", { "pyproject.toml": "[tool.ruff.lint]\nselect=[]\n" }).vars.lint, "ruff check .");
  assert.equal(facts("python", { "pyproject.toml": "", "ruff.toml": "" }).vars.lint, "ruff check .");
  assert.equal(facts("python", { "requirements-dev.txt": "ruff==0.5\n", "requirements.txt": "" }).vars.format, "ruff format .");
});

test("python: black alone gives a format command and no lint", () => {
  const v = facts("python", { "pyproject.toml": "[tool.black]\nline-length=88\n" }).vars;
  assert.equal(v.format, "black .");
  assert.equal(v.lint, "");
});

test("python: flake8 alone gives a lint command and no format", () => {
  const v = facts("python", { "requirements.txt": "flake8\n" }).vars;
  assert.equal(v.lint, "flake8");
  assert.equal(v.format, "");
});

test("python: pytest is the test command even when the project's files never mention it", () => {
  const v = facts("python", { "requirements.txt": "requests\n" }).vars;
  assert.equal(v.test, "pytest");
  assert.equal(v.testOne, "pytest <file>");
  assert.equal(v.testRule, "pytest");
});

test("python: no linter at all leaves lint and format empty, and there is never a build", () => {
  const v = facts("python", { "requirements.txt": "requests\n" }).vars;
  assert.equal(v.lint, "");
  assert.equal(v.format, "");
  assert.equal(v.lintFormat, "");
  assert.equal(v.build, "");
});

test("python: project name from [project] or [tool.poetry]", () => {
  assert.equal(facts("python", { "pyproject.toml": '[project]\nname = "orders-api"\n' }).vars.name, "orders-api");
  assert.equal(facts("python", { "pyproject.toml": "[tool.poetry]\nname = 'poet'\n" }).vars.name, "poet");
});

test("python: run is only known for Django", () => {
  assert.equal(facts("python", { "requirements.txt": "", "manage.py": "" }).vars.run, "python manage.py runserver");
  assert.equal(facts("python", { "pyproject.toml": "[tool.uv]\n", "manage.py": "" }).vars.run, "uv run python manage.py runserver");
  assert.equal(facts("python", { "requirements.txt": "" }).vars.run, "");
});

test("python: the add-dependency convention names the tool, and is empty for pip", () => {
  assert.match(facts("python", { "pyproject.toml": "[tool.uv]\n" }).vars.addDep, /`uv add`/);
  assert.match(facts("python", { "pyproject.toml": "[tool.poetry]\n" }).vars.addDep, /`poetry add`/);
  assert.equal(facts("python", { "requirements.txt": "" }).vars.addDep, "");
});

test("toml helpers: tables, sub-tables and strings, and nothing from comments or other tables", () => {
  const text = '# [tool.ruff]\n[project]\nname = "a"\n[tool.ruff.lint]\nname = "not this"\n';
  assert.equal(tomlHasTable(text, "tool.ruff"), true, "a sub-table counts");
  assert.equal(tomlHasTable('# [tool.ruff]\n', "tool.ruff"), false, "a commented header does not");
  assert.equal(tomlHasTable("[tool.rufffy]\n", "tool.ruff"), false);
  assert.equal(tomlString(text, "project", "name"), "a");
  assert.equal(tomlString(text, "tool.poetry", "name"), null);
});

// ---------------------------------------------------------------------------------------------- go

test("go: the module's last element is the name; a /v2 suffix is skipped", () => {
  assert.equal(moduleName("module github.com/acme/orders\n"), "orders");
  assert.equal(moduleName("module github.com/acme/orders/v2\n"), "orders");
  assert.equal(moduleName('module "example.com/x"\n'), "x");
  assert.equal(moduleName("// no module line\n"), null);
});

test("go: commands, with go vet as lint by default", () => {
  const v = facts("go", { "go.mod": "module github.com/acme/orders\n" }).vars;
  assert.equal(v.name, "orders");
  assert.equal(v.build, "go build ./...");
  assert.equal(v.test, "go test ./...");
  assert.equal(v.testOne, "go test ./<pkg> -run <Test>");
  assert.equal(v.lint, "go vet ./...");
  assert.equal(v.format, "gofmt -w .");
  assert.equal(v.lintRule, "go vet");
  assert.equal(v.formatRule, "gofmt");
});

test("go: golangci-lint when the project has a config for it", () => {
  for (const f of [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"]) {
    const v = facts("go", { "go.mod": "module x\n", [f]: "" }).vars;
    assert.equal(v.lint, "golangci-lint run", f);
    assert.equal(v.lintRule, "golangci-lint run", f);
  }
});

test("go: run is `go run .` for a main package, else the first cmd/<name>, else nothing", () => {
  assert.equal(facts("go", { "go.mod": "module x\n", "main.go": "package main\n" }).vars.run, "go run .");
  assert.equal(facts("go", { "go.mod": "module x\n", "cmd/api/main.go": "package main\n", "cmd/cli/main.go": "package main\n" }).vars.run, "go run ./cmd/api");
  assert.equal(facts("go", { "go.mod": "module x\n", "lib.go": "package x\n" }).vars.run, "");
  assert.equal(facts("go", { "go.mod": "module x\n", "main.go": "package other\n" }).vars.run, "");
});

// -------------------------------------------------------------------------------------------- flutter

test("flutter: a Flutter pubspec gets flutter commands", () => {
  const v = facts("flutter", { "pubspec.yaml": "name: shop_app\ndependencies:\n  flutter:\n    sdk: flutter\n" }).vars;
  assert.equal(v.name, "shop_app");
  assert.equal(v.test, "flutter test");
  assert.equal(v.testOne, "flutter test <file>");
  assert.equal(v.lint, "flutter analyze");
  assert.equal(v.format, "dart format .");
  assert.equal(v.run, "flutter run");
});

test("flutter: a plain Dart package gets dart commands", () => {
  const f = facts("flutter", { "pubspec.yaml": "name: shop_core\ndependencies:\n  http: ^1.0.0\n" });
  assert.equal(f.vars.test, "dart test");
  assert.equal(f.vars.lint, "dart analyze");
  assert.equal(f.vars.run, "dart run");
  assert.equal(f.vars.build, "", "no build target for Dart");
  assert.match(f.summary, /Dart/);
});

test("flutter: the build target comes from the platform folders", () => {
  const spec = "name: a\nflutter:\n  uses-material-design: true\n";
  assert.equal(facts("flutter", { "pubspec.yaml": spec, "android/app/x": "" }).vars.build, "flutter build apk");
  assert.equal(facts("flutter", { "pubspec.yaml": spec, "web/index.html": "" }).vars.build, "flutter build web");
  assert.equal(facts("flutter", { "pubspec.yaml": spec, "ios/Runner/x": "" }).vars.build, "flutter build ios");
  assert.equal(facts("flutter", { "pubspec.yaml": spec }).vars.build, "");
  assert.equal(facts("flutter", { "pubspec.yaml": spec, "android/x": "", "web/x": "" }).vars.buildRule, "flutter build");
});

// ----------------------------------------------------------------------------------------------- java

test("java: Maven with the wrapper uses ./mvnw, without it mvn", () => {
  const pom = "<project><artifactId>orders</artifactId></project>";
  const w = facts("java", { "pom.xml": pom, mvnw: "" }).vars;
  assert.equal(w.build, "./mvnw package -DskipTests");
  assert.equal(w.test, "./mvnw test");
  assert.equal(w.testOne, "./mvnw test -Dtest=<Class>");
  assert.equal(w.name, "orders");
  assert.equal(facts("java", { "pom.xml": pom }).vars.test, "mvn test");
});

test("java: Gradle with the wrapper uses ./gradlew, without it gradle", () => {
  const w = facts("java", { "build.gradle": "", gradlew: "" }).vars;
  assert.equal(w.build, "./gradlew build -x test");
  assert.equal(w.test, "./gradlew test");
  assert.equal(w.testOne, "./gradlew test --tests <Class>");
  assert.equal(facts("java", { "build.gradle.kts": "" }).vars.test, "gradle test");
});

test("java: Maven wins when a folder has both a pom and a Gradle build", () => {
  assert.equal(facts("java", { "pom.xml": "<project/>", "build.gradle": "" }).vars.test, "mvn test");
});

test("java: Spotless and Checkstyle only when the build file names them", () => {
  assert.equal(facts("java", { "pom.xml": "<plugin>spotless-maven-plugin</plugin>" }).vars.lint, "mvn spotless:check");
  assert.equal(facts("java", { "pom.xml": "<plugin>spotless-maven-plugin</plugin>" }).vars.format, "mvn spotless:apply");
  assert.equal(facts("java", { "pom.xml": "<plugin>maven-checkstyle-plugin</plugin>" }).vars.lint, "mvn checkstyle:check");
  assert.equal(facts("java", { "pom.xml": "<project/>" }).vars.lint, "");
  assert.equal(facts("java", { "build.gradle": "plugins { id 'com.diffplug.spotless' }" }).vars.lint, "gradle spotlessCheck");
  assert.equal(facts("java", { "build.gradle": "plugins { id 'checkstyle' }" }).vars.lint, "gradle checkstyleMain checkstyleTest");
  assert.equal(facts("java", { "build.gradle": "" }).vars.lint, "");
});

test("java: Spring Boot gives a run command and a convention", () => {
  const boot = facts("java", { "pom.xml": "<parent><artifactId>spring-boot-starter-parent</artifactId></parent>" });
  assert.equal(boot.vars.run, "mvn spring-boot:run");
  assert.match(boot.vars.springNote, /Controllers/);
  assert.equal(facts("java", { "build.gradle.kts": 'plugins { id("org.springframework.boot") }', gradlew: "" }).vars.run, "./gradlew bootRun");
  const plain = facts("java", { "pom.xml": "<project/>" });
  assert.equal(plain.vars.run, "");
  assert.equal(plain.vars.springNote, "");
});

test("java: the artifactId is the project's own, not its parent's", () => {
  assert.equal(artifactId("<parent><artifactId>spring-boot-starter-parent</artifactId></parent><artifactId>orders</artifactId>"), "orders");
  assert.equal(artifactId("<project/>"), null);
});

test("java: the Gradle root project name", () => {
  const proj = project({ "settings.gradle.kts": 'rootProject.name = "shop"\n' });
  try { assert.equal(gradleRootName(proj.dir), "shop"); } finally { proj.cleanup(); }
  assert.equal(facts("java", { "build.gradle": "", "settings.gradle": "rootProject.name = 'store'\n" }).vars.name, "store");
});

test("summaries: dotnet says which solution it chose, and nothing when there is no choice", () => {
  assert.equal(facts("dotnet", { "A.sln": "", "B.sln": "" }).summary, "A.sln chosen of 2 solutions");
  assert.equal(facts("dotnet", { "A.sln": "" }).summary, "");
  assert.match(facts("dotnet", { "A.csproj": LIB, "B.csproj": LIB }).summary, /no single solution or project file/);
  assert.equal(facts("flutter", { "pubspec.yaml": "name: a\nflutter:\n  x: 1\n" }).summary, "Flutter SDK");
  assert.match(facts("flutter", { "pubspec.yaml": "name: a\n" }).summary, /plain Dart package/);
});
