import type { ResourceSchema, UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';

/**
 * @group Resources
 */
export interface IResourceAction<T extends UnknownResource> {
  actionTimeoutInMs?: number;

  filter(diff: Diff): boolean;

  handle(diff: Diff): Promise<T['response']>;

  mock(diff: Diff, capture: Partial<ResourceSchema<T>['response']>): Promise<T['response']>;
}
