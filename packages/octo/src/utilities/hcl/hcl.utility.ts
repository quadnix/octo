import type { TerraformService } from '../../services/terraform/terraform.service.js';

/**
 * Serializes and diffs octo's rendered terraform into stable, snapshot-friendly strings.
 *
 * The render format is octo-owned and regular — `# <moduleId>/<file>` section headers, blank-line
 * separated top-level blocks — so everything here is plain string work needing no HCL parser or
 * external diff library. {@link unifiedDiff} is the generic line-diff engine; {@link diffBlocks}
 * layers octo's block structure on top of it.
 *
 * @internal
 */
export class HclUtility {
  /**
   * Diffs two {@link serialize} renders at the block level. A block is identified by its header line,
   * and blocks sharing a header (one `provider "aws"` per alias) by their first body line too, so a
   * body change reads as `~` (a line-level {@link unifiedDiff} of what changed inside the block),
   * not as an unrelated add + remove. An added block shows its full new body, a removed block its full
   * old body — symmetric, with nothing trimmed away. The `+`/`-`/`~` vocabulary mirrors the
   * `digestDiffs` digest, tagged with `moduleId/file`. Returns `'<no changes>'` when nothing moved.
   *
   * @internal
   */
  static diffBlocks(previous: string, current: string): string {
    const previousSections = HclUtility.parseBlocks(previous);
    const currentSections = HclUtility.parseBlocks(current);

    const entries: string[] = [];
    const keys = [...new Set([...previousSections.keys(), ...currentSections.keys()])].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const key of keys) {
      const previousTexts = previousSections.get(key) ?? [];
      const currentTexts = currentSections.get(key) ?? [];

      // A header repeated on either side is keyed with its first body line on both sides.
      const repeatedHeaders = new Set([
        ...HclUtility.repeatedHeaders(previousTexts),
        ...HclUtility.repeatedHeaders(currentTexts),
      ]);
      const previousBlocks = HclUtility.keyBlocks(previousTexts, repeatedHeaders);
      const currentBlocks = HclUtility.keyBlocks(currentTexts, repeatedHeaders);
      const headers = [...new Set([...previousBlocks.keys(), ...currentBlocks.keys()])].sort((a, b) =>
        a.localeCompare(b),
      );
      for (const header of headers) {
        const before = previousBlocks.get(header);
        const after = currentBlocks.get(header);
        if (before === undefined) {
          entries.push(`+ ${key}\n${after}`);
        } else if (after === undefined) {
          entries.push(`- ${key}\n${before}`);
        } else if (before !== after) {
          entries.push(`~ ${key} ${header}\n${HclUtility.unifiedDiff(before, after, { contextLines: 1 })}`);
        }
      }
    }

    return entries.length > 0 ? entries.join('\n\n') : '<no changes>';
  }

  /**
   * Flattens the rendered terragrunt folders into one snapshot-friendly string: folders sorted by
   * module id, files in a stable order, each prefixed with a `# <moduleId>/<file>` header. An empty
   * file shows a `<empty>` body, so the file is still visible in the snapshot rather than omitted.
   *
   * @internal
   */
  static serialize(moduleFiles: ReturnType<TerraformService['renderAllModules']>): string {
    const parts: string[] = [];
    for (const moduleId of [...moduleFiles.keys()].sort((a, b) => a.localeCompare(b))) {
      const files = moduleFiles.get(moduleId)!;
      const entries: [string, string][] = [
        ['main.tf', files.mainTf],
        ['outputs.tf', files.outputsTf],
        ['terragrunt.hcl', files.terragruntHcl],
        ['variables.tf', files.variablesTf],
      ];
      for (const [name, content] of entries) {
        const trimmed = content.trim();
        parts.push(`# ${moduleId}/${name}\n${trimmed || '<empty>'}`);
      }
    }
    return parts.join('\n\n');
  }

  /**
   * Produces a git-style unified line diff of two multi-line strings, collapsing unchanged regions
   * to at most `contextLines` of surrounding context per change and emitting `@@ -a,c +b,c @@` hunk
   * headers. Changed lines are tagged `- ` (only in `before`) and `+ ` (only in `after`); context
   * lines are tagged with two spaces, so the markers line up. Pure plain text, no ANSI color, so it
   * is safe to embed in a snapshot.
   *
   * Returns an empty string when the two inputs are identical.
   *
   * @internal
   */
  static unifiedDiff(before: string, after: string, { contextLines = 3 }: { contextLines?: number } = {}): string {
    const a = before.length === 0 ? [] : before.split('\n');
    const b = after.length === 0 ? [] : after.split('\n');

    const operations = HclUtility.diffLines(a, b);
    if (operations.every((o) => o.type === 'common')) {
      return '';
    }

    // An op is kept when it is itself a change, or within `contextLines` of one. Consecutive kept ops
    // form a hunk; the runs of dropped ops between them are the collapsed unchanged regions.
    const isKept = operations.map((_, index) => {
      const from = Math.max(0, index - contextLines);
      const to = Math.min(operations.length - 1, index + contextLines);
      for (let k = from; k <= to; k++) {
        if (operations[k].type !== 'common') {
          return true;
        }
      }
      return false;
    });

    const hunks: string[] = [];
    let index = 0;
    while (index < operations.length) {
      if (!isKept[index]) {
        index++;
        continue;
      }

      const start = index;
      while (index < operations.length && isKept[index]) {
        index++;
      }
      const end = index; // exclusive.

      let aCount = 0;
      let bCount = 0;
      const lines: string[] = [];
      for (let k = start; k < end; k++) {
        const op = operations[k];
        if (op.type === 'common') {
          aCount++;
          bCount++;
          lines.push(`  ${op.text}`);
        } else if (op.type === 'remove') {
          aCount++;
          lines.push(`- ${op.text}`);
        } else {
          bCount++;
          lines.push(`+ ${op.text}`);
        }
      }

      // `aBefore`/`bBefore` count the lines consumed before this hunk, so the hunk starts on the next
      // line. A hunk that adds or removes nothing on a side reports that side at the boundary line
      // with a zero count, matching unified-diff convention.
      const aBefore = operations.slice(0, start).filter((o) => o.type !== 'add').length;
      const bBefore = operations.slice(0, start).filter((o) => o.type !== 'remove').length;
      const aStart = aCount > 0 ? aBefore + 1 : aBefore;
      const bStart = bCount > 0 ? bBefore + 1 : bBefore;

      hunks.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@\n${lines.join('\n')}`);
    }

    return hunks.join('\n');
  }

  /**
   * Builds the shortest edit script between two line arrays via the classic longest-common-subsequence
   * DP. Quadratic in the number of lines, which is fine for the small blocks this serves. A removal is
   * preferred over an addition on ties so a changed line reads as `-old` then `+new`.
   *
   * @internal
   */
  private static diffLines(a: string[], b: string[]): { text: string; type: 'add' | 'common' | 'remove' }[] {
    const n = a.length;
    const m = b.length;
    const commonLength: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        commonLength[i][j] =
          a[i] === b[j] ? commonLength[i + 1][j + 1] + 1 : Math.max(commonLength[i + 1][j], commonLength[i][j + 1]);
      }
    }

    const operations: { text: string; type: 'add' | 'common' | 'remove' }[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        operations.push({ text: a[i], type: 'common' });
        i++;
        j++;
      } else if (commonLength[i + 1][j] >= commonLength[i][j + 1]) {
        operations.push({ text: a[i], type: 'remove' });
        i++;
      } else {
        operations.push({ text: b[j], type: 'add' });
        j++;
      }
    }
    while (i < n) {
      operations.push({ text: a[i], type: 'remove' });
      i++;
    }
    while (j < m) {
      operations.push({ text: b[j], type: 'add' });
      j++;
    }

    return operations;
  }

  /**
   * Keys blocks by their header line (e.g. `resource "aws_vpc" "vpc-x" {`), adding the first body line
   * for a header in `repeatedHeaders`, and an occurrence number for any key still taken.
   *
   * @internal
   */
  private static keyBlocks(texts: string[], repeatedHeaders: Set<string>): Map<string, string> {
    const blocks = new Map<string, string>();
    for (const text of texts) {
      const [header, firstBodyLine = ''] = text.split('\n');
      const baseKey = repeatedHeaders.has(header) ? `${header} ${firstBodyLine.trim()}` : header;
      let key = baseKey;
      for (let occurrence = 2; blocks.has(key); occurrence++) {
        key = `${baseKey} #${occurrence}`;
      }
      blocks.set(key, text);
    }
    return blocks;
  }

  /**
   * Splits a {@link serialize} render into its top-level blocks, grouped by `moduleId/file`. Relies on
   * octo's regular render format — `# <moduleId>/<file>` section headers, and a top-level block
   * starting on an unindented line that is not a closing bracket.
   *
   * @internal
   */
  private static parseBlocks(serialized: string): Map<string, string[]> {
    const sections = new Map<string, string[]>();
    if (!serialized) {
      return sections;
    }

    let currentKey: string | undefined;
    let buffer: string[] = [];
    const flush = (): void => {
      if (currentKey === undefined) {
        return;
      }
      // Split into top-level blocks; a blank line inside a block does not end it.
      const units: string[][] = [];
      for (const line of buffer) {
        if (line.trim() && !/^[\s)\]}]/.test(line)) {
          units.push([line]);
        } else if (units.length > 0) {
          units[units.length - 1].push(line);
        }
      }
      sections.set(
        currentKey,
        units.map((u) => u.join('\n').trim()),
      );
      buffer = [];
    };

    for (const line of serialized.split('\n')) {
      const header = /^# (.+\/.+\.(?:tf|hcl))$/.exec(line);
      if (header) {
        flush();
        currentKey = header[1];
      } else {
        buffer.push(line);
      }
    }
    flush();

    return sections;
  }

  /**
   * Returns the header lines that more than one of these blocks starts with.
   *
   * @internal
   */
  private static repeatedHeaders(texts: string[]): string[] {
    const headers = texts.map((t) => t.split('\n')[0]);
    return headers.filter((h, index) => headers.indexOf(h) !== index);
  }
}
