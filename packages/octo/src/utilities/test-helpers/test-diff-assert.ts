import type { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { DiffAction } from '../../functions/diff/diff.js';

export class DiffAssert {
  constructor(private readonly diffs: DiffMetadata[][]) {}

  private get flat(): DiffMetadata[] {
    return this.diffs.flat();
  }

  digest(): string[] {
    const add = new Set<string>();
    const del = new Set<string>();
    const update = new Set<string>();

    for (const d of this.flat) {
      if (d.action === DiffAction.ADD && d.field === 'resourceId') add.add(d.node.getContext());
      else if (d.action === DiffAction.DELETE && d.field === 'resourceId') del.add(d.node.getContext());
      else if (d.action === DiffAction.UPDATE) update.add(d.node.getContext());
    }

    return [
      ...[...add].sort().map((context) => `+ ${context}`),
      ...[...del].sort().map((context) => `- ${context}`),
      ...[...update].sort().map((context) => `~ ${context}`),
    ];
  }
}
