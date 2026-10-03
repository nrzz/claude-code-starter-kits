// Small file helpers: tolerant reads, exclusive creates, atomic writes, backup names.
import fs from "node:fs";
import path from "node:path";

/** `text` without a leading byte order mark (U+FEFF), which some editors on Windows put at the start of a file. */
export const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** File contents as text (BOM stripped), or null when it cannot be read. */
export function readText(file) {
  try { return stripBom(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** Directory entries (with types), or [] when the folder cannot be read. */
export function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/** The same path with forward slashes, for display and for file names inside templates. */
export const toPosix = (p) => p.split(path.sep).join("/");

/** A and B name the same place, symbolic links resolved (macOS /var is a link to /private/var). */
export function samePath(a, b) {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const [x, y] = [real(a), real(b)];
  return process.platform === "win32" || process.platform === "darwin" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** `child` is `parent` or lies inside it. */
export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Create a file that must not exist yet (flag "wx": the check and the create are one step, so a file that
 * appears between planning and writing is never overwritten). Parent folders are created.
 * Returns false when the file already exists.
 */
export function writeNew(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, text, { flag: "wx" });
    return true;
  } catch (e) {
    if (e && e.code === "EEXIST") return false;
    throw e;
  }
}

/**
 * Replace a file through a temp file and a rename, so readers never see half of it. A symbolic link is
 * followed, so the file it points to is what changes and the link itself stays a link.
 */
export function writeFileAtomic(file, text) {
  let target = file;
  try { target = fs.realpathSync(file); } catch { /* a file that does not exist yet */ }
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
    fs.writeFileSync(target, text); // Windows refuses a rename over a file that another process holds open
  }
}

const two = (n) => String(n).padStart(2, "0");

/** 20261004-101530 (local time), used in backup file names. */
export function timestamp(d = new Date()) {
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

/** A path that does not exist yet: `base`, else `base-1`, `base-2` ... */
export function uniquePath(base) {
  if (!exists(base)) return base;
  for (let i = 1; i < 1000; i++) if (!exists(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

/** Line endings made LF, so templates and files compare equal on every OS. */
export const lf = (text) => text.replace(/\r\n?/g, "\n");
