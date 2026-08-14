import type { UnknownResource } from '../../app.type.js';
import type { DiffMetadata } from './diff-metadata.js';
import { DiffAction } from './diff.js';

/**
 * One octo resource's diffs, collapsed to a single action.
 */
export interface AggregatedResourceAction {
  action: DiffAction.ADD | DiffAction.DELETE | DiffAction.REPLACE | DiffAction.UPDATE;
  reason?: string;
  resourceId: string;
}

/**
 * Collapses a resource's field-level diffs into one action per resource, keyed by resource context.
 *
 * Precedence: an add/delete of `resourceId` wins; a REPLACE beats an UPDATE; otherwise UPDATE.
 * `reason` is taken from the winning diff.
 *
 * @internal
 */
export function aggregateResourceActions(diffs: DiffMetadata[]): Map<string, AggregatedResourceAction> {
  const aggregated = new Map<string, AggregatedResourceAction>();

  for (const diff of diffs) {
    const node = diff.node as UnknownResource;
    const context = node.getContext();
    const reason = diff.diff.reason;

    if (diff.action === DiffAction.DELETE && diff.field === 'resourceId') {
      aggregated.set(context, { action: DiffAction.DELETE, reason, resourceId: node.resourceId });
    } else if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      aggregated.set(context, { action: DiffAction.ADD, reason, resourceId: node.resourceId });
    } else if (diff.action === DiffAction.REPLACE) {
      const existing = aggregated.get(context);
      if (!existing || existing.action === DiffAction.UPDATE) {
        aggregated.set(context, { action: DiffAction.REPLACE, reason, resourceId: node.resourceId });
      }
    } else if (!aggregated.has(context)) {
      aggregated.set(context, { action: DiffAction.UPDATE, reason, resourceId: node.resourceId });
    } else {
      // A later update may be the only one carrying a reason.
      const existing = aggregated.get(context)!;
      if (existing.action === DiffAction.UPDATE && existing.reason === undefined && reason !== undefined) {
        existing.reason = reason;
      }
    }
  }

  return aggregated;
}
