import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const IMPORT_SOURCE_PATTERN =
  /(?:from\s*|import\(\s*|import\s+|require\(\s*)["'`]([^"'`]+)["'`]/g;

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

describe("importsAliasedPath", () => {
  // Built indirectly so this file's own source never contains a literal
  // `import`/`from`/`require` immediately followed by a quoted "@/..." path
  // — otherwise this test file would flag itself in the scan above.
  const aliasPath = "@" + "/lib/x";

  it("flags a named import through the alias", () => {
    expect(importsAliasedPath(`import { x } from "${aliasPath}";`)).toBe(true);
  });

  it("flags a bare side-effect import through the alias", () => {
    expect(importsAliasedPath(`import "${aliasPath}";`)).toBe(true);
  });

  it("flags a dynamic import and a require through the alias", () => {
    expect(importsAliasedPath(`await import("${aliasPath}");`)).toBe(true);
    expect(importsAliasedPath(`require("${aliasPath}");`)).toBe(true);
  });

  it("does not flag a relative import or an unrelated string containing the alias marker", () => {
    expect(importsAliasedPath('import { x } from "../lib/x";')).toBe(false);
    expect(importsAliasedPath(`// see ${aliasPath} for info`)).toBe(false);
  });
});
