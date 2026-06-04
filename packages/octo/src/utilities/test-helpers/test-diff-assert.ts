import type { DiffValueTypeTagUpdate } from '../../app.type.js';
import type { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { DiffAction } from '../../functions/diff/diff.js';

/**
 * `DiffAssert` provides chainable assertion helpers for `DiffMetadata[][]` returned
 * by {@link TestModuleContainer.commit}.
 *
 * Use it in module tests to assert on resource additions, deletions, and tag updates
 * without relying on verbose inline snapshots.
 *
 * @group Utilities/TestHelpers/DiffAssert
 */
export class DiffAssert {
  constructor(private readonly diffs: DiffMetadata[][]) {}

  private get flat(): DiffMetadata[] {
    return this.diffs.flat();
  }

  hasAdded(nodeContext: string): this {
    const found = this.flat.some(
      (d) => d.action === DiffAction.ADD && d.field === 'resourceId' && d.node.getContext() === nodeContext,
    );
    if (!found) {
      throw new Error(`Expected an "add" diff for "${nodeContext}" but none was found.`);
    }
    return this;
  }

  hasDeleted(nodeContext: string): this {
    const found = this.flat.some(
      (d) => d.action === DiffAction.DELETE && d.field === 'resourceId' && d.node.getContext() === nodeContext,
    );
    if (!found) {
      throw new Error(`Expected a "delete" diff for "${nodeContext}" but none was found.`);
    }
    return this;
  }

  hasNoChanges(): this {
    const count = this.flat.length;
    if (count > 0) {
      throw new Error(`Expected no diffs but found ${count}.`);
    }
    return this;
  }

  hasTagUpdate(nodeContext: string, expected: DiffValueTypeTagUpdate): this {
    const diff = this.flat.find(
      (d) => d.action === DiffAction.UPDATE && d.field === 'tags' && d.node.getContext() === nodeContext,
    );
    if (!diff) {
      throw new Error(`Expected a "tags" update diff for "${nodeContext}" but none was found.`);
    }
    const actual = diff.value as DiffValueTypeTagUpdate;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Tag update for "${nodeContext}" did not match.\nExpected: ${JSON.stringify(
          expected,
          null,
          2,
        )}\nActual:   ${JSON.stringify(actual, null, 2)}`,
      );
    }
    return this;
  }
}
