import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * The core reaches for no ambient capability.
 *
 * §6: *the core is handed a capability, it never reaches for one.* This is the
 * fifth surface by which a capability-as-proof leaks (§6.3) — not forging a
 * value, not extracting from it, not injecting into it, not substituting its
 * contract, but **not asking at all**. No type can catch it, because no type is
 * involved.
 *
 * It is also the one this project actually committed: three search adapters
 * called the global `fetch` from inside `src/core/`, which type-checked because
 * `fetch` exists on both sides. It was found by someone asking a question about
 * something else — a defect visible to a grep nobody was going to run.
 *
 * ## Why an AST walk and not a text search
 *
 * A textual lint matches its own vocabulary: it fires on `fetch` in a comment,
 * in a string, in `DocumentFetcher`, and misses `globalThis.fetch`. Walking the
 * syntax tree asks the question about *the code* rather than about its
 * spelling. TypeScript is already a dependency, so this costs nothing.
 *
 * **What it therefore claims, and no more**: it catches every *accidental*
 * reach and no *determined* one. `globalThis['fet' + 'ch']` passes, and that is
 * fine — the failure this guards is forgetting, not smuggling. It is a
 * complement to the runtime trap in `test/search.ts`, and neither subsumes the
 * other: the trap observes behaviour and cannot be evaded, but only covers
 * paths the tests walk; this covers every line, and can be.
 */

/** Ambient names the core must be handed rather than take. */
const FORBIDDEN = new Map<string, string>([
  ['fetch', 'network — take a Transport or a DocumentFetcher (§6.3)'],
  ['XMLHttpRequest', 'network'],
  ['WebSocket', 'network'],
  ['EventSource', 'network'],
  ['navigator', 'host surface — including sendBeacon'],
  ['localStorage', 'storage — take a SpotterStore'],
  ['sessionStorage', 'storage — take a SpotterStore'],
  ['indexedDB', 'storage — take a SpotterStore'],
  ['caches', 'storage'],
  ['document', 'DOM — the core is host-agnostic'],
  ['window', 'DOM'],
  ['chrome', 'browser extension API'],
  ['browser', 'browser extension API'],
  ['process', 'Node ambient'],
  ['crypto', 'encryption is a host capability (§6.5)']
]);

/** Objects whose members are the same ambient by another road. */
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self']);

interface Reach {
  file: string;
  line: number;
  name: string;
  why: string;
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFilesUnder(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Names the file declares for itself — imports, variables, parameters,
 * functions, classes. An identifier matching one of these is that declaration,
 * not the ambient.
 *
 * ⚠️ This is file-scoped rather than block-scoped, so a local named `document`
 * anywhere in a file excuses every `document` in it. That over-approximates
 * *towards missing a reach*, which is the wrong direction for a guard — so the
 * shadowed names are **reported**, not silently swallowed. A filter that does
 * not account for what it dropped is the thing this project refuses.
 */
function declaredNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const add = (n: ts.Node | undefined) => {
    if (n && ts.isIdentifier(n)) names.add(n.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node) || ts.isImportClause(node)) add(node.name);
    else if (ts.isNamespaceImport(node)) add(node.name);
    else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) add(node.name);
    else if (ts.isParameter(node) && ts.isIdentifier(node.name)) add(node.name);
    else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) add(node.name);
    else if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) add(node.name);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function reachesIn(file: string, text: string): { reaches: Reach[]; shadowed: Set<string> } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const declared = declaredNames(source);
  const reaches: Reach[] = [];
  const shadowed = new Set<string>();

  const at = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    // `globalThis.fetch`, `window.localStorage`, … — the same ambient by another road.
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      GLOBAL_OBJECTS.has(node.expression.text)
    ) {
      const why = FORBIDDEN.get(node.name.text);
      if (why) reaches.push({ file, line: at(node), name: `${node.expression.text}.${node.name.text}`, why });
    }

    if (ts.isIdentifier(node)) {
      const why = FORBIDDEN.get(node.text);
      if (why) {
        const parent = node.parent;
        // `x.fetch` and `{ fetch: … }` name a member, not the ambient.
        const isMemberName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isPropertySignature(parent) && parent.name === node) ||
          (ts.isMethodSignature(parent) && parent.name === node) ||
          (ts.isMethodDeclaration(parent) && parent.name === node) ||
          (ts.isBindingElement(parent) && parent.name === node) ||
          (ts.isImportSpecifier(parent) && parent.name === node);
        if (!isMemberName) {
          if (declared.has(node.text)) shadowed.add(node.text);
          else reaches.push({ file, line: at(node), name: node.text, why });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { reaches, shadowed };
}

test('the core reaches for no ambient capability', () => {
  const files = tsFilesUnder(join(process.cwd(), 'src', 'core'));
  assert.ok(files.length > 5, 'the walk should find the core, not an empty directory');

  const reaches: Reach[] = [];
  const shadowed = new Map<string, string[]>();

  for (const file of files) {
    const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
    const found = reachesIn(rel, readFileSync(file, 'utf8'));
    reaches.push(...found.reaches);
    for (const name of found.shadowed) {
      shadowed.set(name, [...(shadowed.get(name) ?? []), rel]);
    }
  }

  // Report what the shadowing rule excused, so the over-approximation is
  // visible rather than silent. A guard that quietly narrows itself is the
  // silent filter this project refuses everywhere else.
  if (shadowed.size) {
    console.log('  (shadowed by a local declaration, so not checked:');
    for (const [name, files_] of shadowed) console.log(`     ${name} in ${files_.join(', ')}`);
    console.log('  )');
  }

  assert.deepEqual(
    reaches.map(r => `${r.file}:${r.line} ${r.name} — ${r.why}`),
    [],
    'the core must be handed these, never take them'
  );
});

test('the guard would see a reach if one were added', () => {
  // A check that passes proves nothing until it has been shown to fail. This is
  // the mutation test, inlined: the same walk over a synthetic file that does
  // exactly what the rule forbids.
  const bad = `
    export async function leak(url: string) {
      const a = await fetch(url);
      const b = await globalThis.fetch(url);
      localStorage.setItem('k', 'v');
      return [a, b];
    }
  `;
  const { reaches } = reachesIn('synthetic.ts', bad);
  const names = reaches.map(r => r.name).sort();
  assert.deepEqual(names, ['fetch', 'globalThis.fetch', 'localStorage']);
});

test('the guard does not fire on a member named like an ambient', () => {
  // `config.transport`, `{ fetch: … }`, `DocumentFetcher.fetch` — the whole
  // false-positive class a textual lint would produce.
  const fine = `
    interface F { fetch(url: string): Promise<unknown>; }
    export function use(f: F, cfg: { fetch: F['fetch'] }) {
      return [f.fetch('/a'), cfg.fetch('/b')];
    }
  `;
  const { reaches } = reachesIn('synthetic.ts', fine);
  assert.deepEqual(reaches, []);
});
