// Java: Maven (pom.xml) or Gradle (build.gradle, build.gradle.kts). The wrapper (./mvnw, ./gradlew) is used
// when the project has one. Lint and format are Spotless or Checkstyle, only when the build file names them.
import path from "node:path";
import { cleanName, cmd } from "../cmd.mjs";
import { has, read } from "./util.mjs";

const MARKERS = ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"];

// The project's own artifactId: the first one that is not inside <parent>.
export function artifactId(pom) {
  const noParent = String(pom || "").replace(/<parent>[\s\S]*?<\/parent>/, "");
  return /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(noParent)?.[1] ?? null;
}

export function gradleRootName(dir) {
  for (const f of ["settings.gradle.kts", "settings.gradle"]) {
    const m = /rootProject\.name\s*=\s*["']([^"']+)["']/.exec(read(dir, f) || "");
    if (m) return m[1];
  }
  return null;
}

function maven(dir) {
  const pom = read(dir, "pom.xml") || "";
  const mvn = has(dir, "mvnw") ? "./mvnw" : "mvn";
  const spotless = /spotless-maven-plugin/.test(pom);
  const checkstyle = /maven-checkstyle-plugin/.test(pom);
  return {
    name: artifactId(pom),
    summary: mvn === "./mvnw" ? "Maven wrapper" : "Maven",
    commands: {
      build: cmd(`${mvn} package`, "-DskipTests"),
      test: cmd(`${mvn} test`),
      testOne: cmd(`${mvn} test`, "-Dtest=<Class>"),
      lint: spotless ? cmd(`${mvn} spotless:check`) : checkstyle ? cmd(`${mvn} checkstyle:check`) : null,
      format: spotless ? cmd(`${mvn} spotless:apply`) : null,
      run: /spring-boot-maven-plugin|spring-boot-starter-parent/.test(pom) ? cmd(`${mvn} spring-boot:run`) : null,
    },
    springBoot: /spring-boot/.test(pom),
  };
}

function gradle(dir) {
  const build = `${read(dir, "build.gradle.kts") || ""}\n${read(dir, "build.gradle") || ""}`;
  const gw = has(dir, "gradlew") ? "./gradlew" : "gradle";
  const spotless = /spotless/.test(build);
  const checkstyle = /\bcheckstyle\b/.test(build);
  const boot = /org\.springframework\.boot/.test(build);
  return {
    name: gradleRootName(dir),
    summary: gw === "./gradlew" ? "Gradle wrapper" : "Gradle",
    commands: {
      build: cmd(`${gw} build`, "-x test"),
      test: cmd(`${gw} test`),
      testOne: cmd(`${gw} test`, "--tests <Class>"),
      lint: spotless ? cmd(`${gw} spotlessCheck`) : checkstyle ? cmd(`${gw} checkstyleMain`, "checkstyleTest") : null,
      format: spotless ? cmd(`${gw} spotlessApply`) : null,
      run: boot ? cmd(`${gw} bootRun`) : null,
    },
    springBoot: boot,
  };
}

export default {
  id: "java",
  label: "Java",
  about: "Maven or Gradle projects, Spring Boot noted",
  markers: "pom.xml, build.gradle(.kts), settings.gradle(.kts)",
  match: (files) => files.filter((n) => MARKERS.includes(n)),

  facts({ dir }) {
    const useMaven = has(dir, "pom.xml");
    const f = useMaven ? maven(dir) : gradle(dir);
    return {
      name: cleanName(f.name) || cleanName(path.basename(dir)) || "project",
      summary: f.summary,
      commands: f.commands,
      extras: {
        springNote: f.springBoot ? "Controllers stay thin; logic lives in services." : "",
      },
    };
  },
};
