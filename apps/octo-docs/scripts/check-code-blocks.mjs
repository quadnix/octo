/**
 * Parses every TypeScript code block in `docs/` and fails on one that is not valid TypeScript.
 *
 * The rule exists because a formatter pointed at `.mdx` will happily reformat a fenced block, and a
 * snippet is usually a class member or an object literal rather than a whole file - so what comes
 * back is mangled beyond reading, and nothing else in the pipeline notices. Docusaurus renders
 * broken code as cheerfully as working code, and a reader who meets `Promise < Diff[] > {` on a
 * fundamentals page stops trusting the prose around it.
 *
 * Snippets are fragments, so each block is tried in the three shapes a doc uses - statements, class
 * members, and a bare expression - and only a block that parses as none of them is a failure.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const FENCE = /^```(\w+)/;

/**
 * The shapes a documented snippet legitimately takes. A block is fine if any one of them parses.
 *
 * The last one is for a block that is nothing but decorators, which is how the naming page shows
 * what a package string looks like across every decorator at once.
 */
const WRAPPERS = [
  (code) => code,
  (code) => `class __DocBlock {\n${code}\n}`,
  (code) => `const __docBlock = ${code};`,
  (code) => `${code}\nclass __DocBlock {}`,
];

/**
 * `/* ... *\/` is the docs' ellipsis, and it stands in for a value as often as for a statement.
 * Reading it as a value first is what lets `{ handle: /* ... *\/ }` through.
 */
const withEllipsesResolved = (code) => code.replaceAll(/\/\* \.\.\. \*\//g, 'undefined');

const mdxFilesIn = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return mdxFilesIn(path);
    }
    return entry.name.endsWith('.mdx') ? [path] : [];
  });

/**
 * Every fenced block on a page whose language marks it as TypeScript, with the line its fence is on.
 */
const typescriptBlocksIn = (contents) => {
  const blocks = [];
  const lines = contents.split('\n');
  let openedAt;
  let language;

  for (const [index, line] of lines.entries()) {
    if (openedAt === undefined) {
      const fence = FENCE.exec(line);
      if (fence) {
        openedAt = index;
        language = fence[1];
      }
      continue;
    }

    if (line.startsWith('```')) {
      if (language === 'typescript' || language === 'ts') {
        blocks.push({ code: lines.slice(openedAt + 1, index).join('\n'), line: openedAt + 1 });
      }
      openedAt = undefined;
    }
  }

  return blocks;
};

/**
 * The syntax errors of the wrapping that came closest to parsing, or none when one parsed cleanly.
 */
const syntaxErrorsIn = (code) => {
  let fewest;

  for (const wrap of WRAPPERS) {
    const sourceFile = ts.createSourceFile('block.ts', wrap(withEllipsesResolved(code)), ts.ScriptTarget.Latest, true);
    const diagnostics = sourceFile.parseDiagnostics ?? [];
    if (diagnostics.length === 0) {
      return [];
    }
    if (!fewest || diagnostics.length < fewest.length) {
      fewest = diagnostics;
    }
  }

  return fewest.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
};

/**
 * What a formatter's damage looks like, which a parser will not tell you about.
 *
 * Reformatting a fragment splits one declaration across several lines, and TypeScript's own parser
 * accepts the result - automatic semicolon insertion reads it as a run of expressions rather than
 * the method it used to be. So the check for it is lexical: these are shapes that appear when a
 * declaration has been broken up, and never in code somebody typed.
 */
const MANGLED_LINE_RULES = [
  { pattern: /^\s*\)?\s*:\s*$/, what: 'a line holding only a type annotation colon' },
  { pattern: /^\s*(override|async|override\s+async)\s*$/, what: 'a modifier stranded on its own line' },
  { pattern: /\b(?:Promise|Array|Map|Set|Record|Partial|Readonly)\s+</, what: 'a space before a type argument list' },
  { pattern: /\w\s+>\s*[{;]/, what: 'a space after a type argument list' },
];

/**
 * The mangling this rule set names, line by line.
 */
const manglingIn = (code) =>
  code.split('\n').flatMap((line, index) => {
    const rule = MANGLED_LINE_RULES.find(({ pattern }) => pattern.test(line));
    return rule ? [{ line: index + 1, what: rule.what }] : [];
  });

const failures = [];
for (const file of mdxFilesIn(DOCS_DIR).sort()) {
  const path = relative(process.cwd(), file);

  for (const block of typescriptBlocksIn(readFileSync(file, 'utf-8'))) {
    for (const mangled of manglingIn(block.code)) {
      failures.push(`${path}:${block.line + mangled.line}: ${mangled.what}`);
    }

    const errors = syntaxErrorsIn(block.code);
    if (errors.length > 0) {
      failures.push(`${path}:${block.line}: ${errors.slice(0, 3).join('; ')}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Malformed TypeScript in ${failures.length} code block(s):\n`);
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    '\nA snippet must parse as statements, as class members, or as a single expression, and must not\n' +
      'carry the marks of a formatter having reshaped a fragment. Rewrite the block by hand, from the\n' +
      'real source it quotes.',
  );
  process.exit(1);
}

console.log('All TypeScript code blocks parse.');
