import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const contractsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studentConsumerRoot = resolve(contractsRoot, "test/fixtures/stage4b/student-consumer");
const publicEmittedEntry = resolve(contractsRoot, "dist/student.js");
const MAX_FILES = 2_000;
const MAX_SOURCE_BYTES = 1024 * 1024;

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

function literal(node: ts.Node | undefined): string | undefined {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

function moduleReference(node: ts.Node): { specifier?: string | undefined; dynamic?: true } | undefined {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
    return { specifier: literal(node.moduleSpecifier) };
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return { specifier: literal(node.argument.literal) };
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return { specifier: literal(node.moduleReference.expression) };
  }
  if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isIdentifier(node.expression) && node.expression.text === "require")) {
    const specifier = literal(node.arguments[0]);
    return specifier === undefined ? { dynamic: true } : { specifier };
  }
  return undefined;
}

function forbiddenReason(specifier: string, containingFile: string, consumerRoot: string): string | undefined {
  if (specifier === "@tsa/contracts/student") return undefined;
  if (specifier === "@tsa/contracts" || specifier.startsWith("@tsa/contracts/")) return "imports a contract surface outside student";
  const fileUrl = /^file:/i.test(specifier);
  if (/^[a-z][a-z0-9+.-]*:/i.test(specifier) && !fileUrl && !specifier.startsWith("node:")) return "imports code outside the declared consumer source graph";
  if (specifier.startsWith(".") || isAbsolute(specifier) || fileUrl) {
    let target: string;
    try {
      target = fileUrl ? fileURLToPath(specifier) : resolve(dirname(containingFile), specifier);
      try { target = realpathSync(target); } catch { /* Missing local modules are checked by TypeScript. */ }
    } catch { return "uses an invalid local module reference"; }
    if (target === publicEmittedEntry) return undefined;
    if (!inside(consumerRoot, target)) return "imports a local module outside the designated student consumer tree";
  }
  return undefined;
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new TypeError("Student consumer trees must not hide imports behind symbolic links");
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        if (files.length >= MAX_FILES || statSync(path).size > MAX_SOURCE_BYTES) throw new TypeError("Student consumer scan exceeds its source limits");
        files.push(path);
      }
    }
  };
  visit(root);
  return files;
}

/** Static import policy for a declared consumer tree; this is not a browser sandbox. */
export function scanConsumerTree(root: string): string[] {
  const violations: string[] = [];
  const consumerRoot = realpathSync(root);
  for (const path of sourceFiles(consumerRoot)) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      const reference = moduleReference(node);
      if (reference?.dynamic) violations.push(`${path}: nonliteral dynamic module loading is forbidden in student consumers`);
      else if (reference?.specifier !== undefined) {
        const reason = forbiddenReason(reference.specifier, path, consumerRoot);
        if (reason !== undefined) violations.push(`${path}: ${reason} (${reference.specifier})`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations;
}

export function runConsumerBoundaryCheck(): string[] {
  return scanConsumerTree(studentConsumerRoot);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const violations = runConsumerBoundaryCheck();
  if (violations.length > 0) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exitCode = 1;
  } else process.stdout.write("Student consumer import boundary passed for test/fixtures/stage4b/student-consumer.\n");
}
