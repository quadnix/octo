import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { IamUser } from '../iam-user.resource.js';

/**
 * @internal
 */
@Action(IamUser)
export class UpdateIamUserTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<IamUser> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<IamUser, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const user = diff.node;
    const properties = user.properties;
    const response = user.response;

    // `us-east-1` is the recommended region for global resources.
    await super.handle(diff, { ...properties, awsRegionId: 'us-east-1', resourceArn: response.Arn! });
  }

  override async mock(diff: Diff<IamUser, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const user = diff.node;
    const properties = user.properties;

    // `us-east-1` is the recommended region for global resources.
    await super.mock(diff, { ...properties, awsRegionId: 'us-east-1' });
  }
}

/**
 * @internal
 */
@Factory<UpdateIamUserTagsResourceAction>(UpdateIamUserTagsResourceAction)
export class UpdateIamUserTagsResourceActionFactory {
  private static instance: UpdateIamUserTagsResourceAction;

  static async create(): Promise<UpdateIamUserTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateIamUserTagsResourceAction(container);
    }
    return this.instance;
  }
}
