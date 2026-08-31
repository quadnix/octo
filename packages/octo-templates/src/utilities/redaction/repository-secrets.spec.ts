import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RedactionUtility } from './redaction.utility.js';

/**
 * Scans every tracked file for a value the redaction rules forbid.
 *
 * The rules under `rules/` are the whole of what counts, and are the same ones the jest snapshot
 * serializer applies, so a new cloud is one rule file rather than a second copy of its patterns.
 * CI runs this on its own through `test:secrets`, after the install a rule import needs.
 */

// eslint-disable-next-line spellcheck/spell-checker
const REPOSITORY_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/**
 * Tracked files nobody writes by hand, and which no rule can say anything useful about.
 */
const UNSCANNED = [/(^|\/)pnpm-lock\.yaml$/, /\.lock$/, /\.terraform\.lock\.hcl$/];

const trackedFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], { cwd: REPOSITORY_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((path) => path.length > 0 && !UNSCANNED.some((pattern) => pattern.test(path)));

/**
 * Scanned line by line, so a failure names somewhere to go, and so an anchored rule reads one value
 * rather than a whole file.
 */
const violationsIn = (path: string): string[] => {
  let contents: string;
  try {
    contents = readFileSync(join(REPOSITORY_ROOT, path), 'utf8');
  } catch {
    return [];
  }
  if (contents.includes('\u0000')) {
    return [];
  }

  return contents.split('\n').flatMap((line, index) => {
    const matches = RedactionUtility.findMatches(line, RedactionUtility.redactionRules());
    return matches.map((match) => `${path}:${index + 1}: ${match}`);
  });
};

describe('Repository secrets UT', () => {
  it('should scan a plausible number of tracked files', () => {
    expect(trackedFiles().length).toBeGreaterThan(100);
  });

  // Only the rules carrying a token are enforced here. An identifier rule has no fixed replacement
  // to assert against, and nothing under "packages/" captures one: a snapshot of a live validate
  // report holds only what octo decides. "apps/octo-docs" keeps captured identifiers deliberately —
  // see "docs/DOCUMENTATION-STANDARDS.md".
  it('should not hold a value a redaction rule forbids, in any tracked file', () => {
    expect(trackedFiles().flatMap(violationsIn)).toEqual([]);
  });
});
