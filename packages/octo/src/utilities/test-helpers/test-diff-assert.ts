import type { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { DiffAction } from '../../functions/diff/diff.js';

export class DiffAssert {
  constructor(private readonly diffs: DiffMetadata[][]) {}

  private get flat(): DiffMetadata[] {
    return this.diffs.flat();
  }

  digest(): string[] {
    const changes: string[] = [];

    for (const d of this.flat) {
      if (d.action === DiffAction.ADD && d.field === 'resourceId') {
        changes.push(`+ ${d.node.getContext()}`);
      } else if (d.action === DiffAction.DELETE && d.field === 'resourceId') {
        changes.push(`- ${d.node.getContext()}`);
      } else if (d.action === DiffAction.REPLACE && d.field === 'resourceId') {
        changes.push(`^ ${d.node.getContext()}`);
      } else if (d.action === DiffAction.UPDATE) {
        changes.push(`* ${d.node.getContext()}`);
      }
    }

    return changes;
  }
}
