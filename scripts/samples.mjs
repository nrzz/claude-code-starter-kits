// One sample project per stack, with every command present. The token table in the README is measured on
// these, and the tests scaffold them. Files are written into a folder the caller gives (a temp folder).
import fs from "node:fs";
import path from "node:path";

const json = (o) => JSON.stringify(o, null, 2) + "\n";

export const SAMPLES = {
  dotnet: {
    about: "a solution with a web project and a test project",
    files: {
      "MyApp.sln": "Microsoft Visual Studio Solution File, Format Version 12.00\n",
      "src/MyApp.Web/MyApp.Web.csproj": '<Project Sdk="Microsoft.NET.Sdk.Web">\n  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>\n</Project>\n',
      "tests/MyApp.Tests/MyApp.Tests.csproj": '<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.9.0" /></ItemGroup>\n</Project>\n',
    },
  },
  node: {
    about: "a TypeScript Next.js app with pnpm and every script",
    files: {
      "package.json": json({
        name: "my-app",
        scripts: { dev: "next dev", build: "next build", test: "vitest run", lint: "eslint .", format: "prettier --write .", typecheck: "tsc --noEmit" },
        dependencies: { next: "15.0.0", react: "19.0.0" },
        devDependencies: { typescript: "5.6.0", vitest: "2.0.0" },
      }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "tsconfig.json": "{}\n",
      "app/page.tsx": "export default function Page() { return null; }\n",
    },
  },
  python: {
    about: "a Django project with uv, ruff and pytest",
    files: {
      "pyproject.toml": '[project]\nname = "my-app"\nversion = "0.1.0"\n\n[tool.uv]\ndev-dependencies = ["pytest", "ruff"]\n\n[tool.ruff]\nline-length = 100\n',
      "uv.lock": "version = 1\n",
      "manage.py": "# django entry point\n",
    },
  },
  go: {
    about: "a module with a main package and golangci-lint",
    files: {
      "go.mod": "module github.com/acme/my-app\n\ngo 1.22\n",
      "main.go": "package main\n\nfunc main() {}\n",
      ".golangci.yml": "run: {}\n",
    },
  },
  flutter: {
    about: "a Flutter app with an Android folder",
    files: {
      "pubspec.yaml": "name: my_app\n\ndependencies:\n  flutter:\n    sdk: flutter\n\nflutter:\n  uses-material-design: true\n",
      "android/app/build.gradle": "// android module\n",
    },
  },
  java: {
    about: "a Spring Boot app built with the Maven wrapper and Spotless",
    files: {
      "pom.xml": "<project>\n  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.3.0</version></parent>\n  <artifactId>my-app</artifactId>\n  <build><plugins><plugin><artifactId>spotless-maven-plugin</artifactId></plugin></plugins></build>\n</project>\n",
      mvnw: "#!/bin/sh\n",
    },
  },
};

/** Write the sample project for `stackId` into `dir`. */
export function writeSample(dir, stackId) {
  for (const [rel, text] of Object.entries(SAMPLES[stackId].files)) {
    const file = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}
