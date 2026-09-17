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

const SOLVER_MODULE_MARKERS = ["lib/solver", "./solver", "lib/words", "./words", "allowed-guesses"];

function referencesSolverModule(specifier: string): boolean {
  return SOLVER_MODULE_MARKERS.some((marker) => specifier.includes(marker));
}

// `src/app/page.tsx` is the one sanctioned place a dynamic `await import(...)`
// of the solver is allowed — that is the whole point of the boundary (the
// solver is reached dynamically, and only dynamically). Every other file must
// never reference these modules as a value at all, static or dynamic.
function hasValueImportOfSolverModules(source: string, file: string): boolean {
  const allowsDynamicImport = file === "src/app/page.tsx";

  const staticImportPattern = /import\s+(type\s+)?[^;]*?\bfrom\s*["'`]([^"'`]+)["'`]/g;
  for (const match of source.matchAll(staticImportPattern)) {
    const isTypeOnly = Boolean(match[1]);
    if (!isTypeOnly && referencesSolverModule(match[2])) return true;
  }

  const requirePattern = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  for (const match of source.matchAll(requirePattern)) {
    if (referencesSolverModule(match[1])) return true;
  }

  if (!allowsDynamicImport) {
    const dynamicImportPattern = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    for (const match of source.matchAll(dynamicImportPattern)) {
      if (referencesSolverModule(match[1])) return true;
    }
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

  const SOLVER_BOUNDARY_FILES = [
    "src/app/page.tsx",
    "src/lib/outcome.ts",
    "src/lib/game-state.ts",
    "src/lib/guess-client.ts",
  ];

  it.each(SOLVER_BOUNDARY_FILES)("%s imports solver/word-list modules as types only", (file) => {
    const source = readFileSync(file, "utf8");
    expect(hasValueImportOfSolverModules(source, file)).toBe(false);
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

describe("hasValueImportOfSolverModules", () => {
  it("allows a type-only import of the solver in any file", () => {
    const source = 'import type { StopReason } from "./solver";';
    expect(hasValueImportOfSolverModules(source, "src/lib/outcome.ts")).toBe(false);
    expect(hasValueImportOfSolverModules(source, "src/app/page.tsx")).toBe(false);
  });

  it("flags a static value import of the solver outside page.tsx", () => {
    const source = 'import { solve } from "./solver";';
    expect(hasValueImportOfSolverModules(source, "src/lib/game-state.ts")).toBe(true);
  });

  it("flags a static value import of the solver even in page.tsx", () => {
    const source = 'import { solve } from "../lib/solver";';
    expect(hasValueImportOfSolverModules(source, "src/app/page.tsx")).toBe(true);
  });

  it("allows a dynamic import of the solver only in page.tsx", () => {
    const source = 'const { solve } = await import("../lib/solver");';
    expect(hasValueImportOfSolverModules(source, "src/app/page.tsx")).toBe(false);
    expect(hasValueImportOfSolverModules(source, "src/lib/guess-client.ts")).toBe(true);
  });

  it("flags a require of a word list in any file", () => {
    const source = 'const { WORDS } = require("./words");';
    expect(hasValueImportOfSolverModules(source, "src/lib/game-state.ts")).toBe(true);
  });
});
