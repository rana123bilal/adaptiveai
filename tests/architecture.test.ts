import { readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript/unstable/ast';
import { API, type Snapshot } from 'typescript/unstable/sync';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repository = fileURLToPath(new URL('../', import.meta.url));
const roots = {
  web: resolve(repository, 'apps/web/src'),
  api: resolve(repository, 'apps/api/src'),
  shared: resolve(repository, 'packages/shared/src'),
};
// TypeScript 7 exposes AST access through its compiler API. Reuse the installed
// compiler rather than introducing a separate parser or import-lint dependency.
const compiler = new API({ cwd: repository });
let snapshot: Snapshot;

beforeAll(() => {
  snapshot = compiler.updateSnapshot({
    openProjects: Object.values(roots).map((root) => resolve(root, '../tsconfig.json')),
  });
});

afterAll(() => {
  snapshot?.dispose();
  compiler.close();
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|d)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function importsIn(path: string): string[] {
  const project = snapshot.getDefaultProjectForFile(path);
  const source = project?.program.getSourceFile(path);
  if (!source) throw new Error(`Compiler did not load ${relative(repository, path)}`);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    let specifier: ts.Node | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      specifier = node.moduleReference.expression;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      specifier = node.arguments[0];
    }
    if (specifier && ts.isStringLiteral(specifier)) imports.push(specifier.text);
    node.forEachChild(visit);
  }
  visit(source);
  return imports;
}

function within(directory: string, path: string): boolean {
  const local = relative(directory, path);
  return !local.startsWith('..') && !isAbsolute(local);
}

for (const layer of ['web', 'api', 'shared'] as const) {
  test(`${layer} keeps dependencies within its application and the shared contract`, () => {
    const violations: string[] = [];
    for (const path of sourceFiles(roots[layer])) {
      for (const specifier of importsIn(path)) {
        const local = specifier.startsWith('.') || isAbsolute(specifier);
        const target = resolve(dirname(path), specifier);
        const allowed = local
          ? within(roots[layer], target)
          : specifier === '@adaptiveai/shared'
            || (layer !== 'shared' && !specifier.startsWith('@adaptiveai/'));
        if (!allowed) violations.push(`${relative(repository, path)} imports ${specifier}`);
      }
    }
    expect(violations, 'Applications import the shared public contract; shared stays framework-independent.').toEqual([]);
  });
}
