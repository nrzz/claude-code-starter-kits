// Flutter and Dart: pubspec.yaml. A pubspec that depends on the Flutter SDK gets `flutter` commands; a plain
// Dart package gets `dart` commands.
import path from "node:path";
import { cleanName, cmd } from "../cmd.mjs";
import { has, read } from "./util.mjs";

const isFlutter = (pubspec) => /^flutter:[ \t]*$/m.test(pubspec) || /^\s+sdk:\s*flutter\b/m.test(pubspec);

// The build target a Flutter project is most likely after, from the platform folders it has.
function buildTarget(dir) {
  if (has(dir, "android")) return "apk";
  if (has(dir, "web")) return "web";
  if (has(dir, "ios")) return "ios";
  return null;
}

export default {
  id: "flutter",
  label: "Flutter",
  about: "Flutter apps and Dart packages",
  markers: "pubspec.yaml",
  match: (files) => files.filter((n) => n === "pubspec.yaml"),

  facts({ dir }) {
    const pubspec = read(dir, "pubspec.yaml") || "";
    const flutter = isFlutter(pubspec);
    const tool = flutter ? "flutter" : "dart";
    const target = flutter ? buildTarget(dir) : null;
    const name = /^name:[ \t]*["']?([\w.-]+)["']?[ \t]*$/m.exec(pubspec)?.[1];
    return {
      name: cleanName(name) || cleanName(path.basename(dir)) || "project",
      summary: flutter ? "Flutter SDK" : "plain Dart package, no Flutter SDK dependency",
      commands: {
        build: target ? cmd("flutter build", target) : null,
        test: cmd(`${tool} test`),
        testOne: cmd(`${tool} test`, "<file>"),
        lint: cmd(`${tool} analyze`),
        format: cmd("dart format", "."),
        run: cmd(`${tool} run`),
      },
      extras: {},
    };
  },
};
