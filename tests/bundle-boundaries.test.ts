import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const IMPORT_SOURCE_PATTERN = /(?:from\s*|import\(\s*|require\(\s*)["'`]([^"'`]+)["'`]/g;

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

function importsAliasedPath(source: string): boolean {
  for (const match of source.matchAll(IMPORT_SOURCE_PATTERN)) {
    if (match[1].startsWith("@/")) return true;
  }
  return false;
}

describe("bundle boundaries", () => {
  it("no source or test file imports through the @/ alias", () => {
    const files = [...collectSourceFiles("src"), ...collectSourceFiles("tests")];
    const offenders = files.filter((file) => importsAliasedPath(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no vitest config file exists", () => {
    const configFiles = ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"];
    expect(configFiles.filter(existsSync)).toEqual([]);
  });
});
