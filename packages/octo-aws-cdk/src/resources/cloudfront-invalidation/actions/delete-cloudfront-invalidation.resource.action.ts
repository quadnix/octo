import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { CloudFrontInvalidation } from '../cloudfront-invalidation.resource.js';

/**
 * Retires an invalidation, which takes no work.
 *
 * An invalidation is a call, not a thing. By the time this runs, the edges have already dropped what
 * they were holding and there is nothing left to undo - un-invalidating is not an operation AWS
 * offers, and would be meaningless if it were.
 *
 * The action exists because the diff that re-runs an invalidation is a replacement, and a
 * replacement is a delete followed by an add. Without it, changing what is published would fail
 * before it could issue the new invalidation.
 *
 * @internal
 */
@Action(CloudFrontInvalidation)
export class DeleteCloudFrontInvalidationResourceAction
  extends ANodeAction
  implements IResourceAction<CloudFrontInvalidation>
{
  /**
   * @internal
   */
  constructor() {
    super();
  }

  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof CloudFrontInvalidation &&
      hasNodeName(diff.node, 'cloudfront-invalidation') &&
      diff.field === 'resourceId'
    );
  }

  /**
   * @internal
   */
  async handle(): Promise<void> {}
}

/**
 * @internal
 */
@Factory<DeleteCloudFrontInvalidationResourceAction>(DeleteCloudFrontInvalidationResourceAction)
export class DeleteCloudFrontInvalidationResourceActionFactory {
  private static instance: DeleteCloudFrontInvalidationResourceAction;

  /**
   * @internal
   */
  static async create(): Promise<DeleteCloudFrontInvalidationResourceAction> {
    if (!this.instance) {
      this.instance = new DeleteCloudFrontInvalidationResourceAction();
    }
    return this.instance;
  }
}
