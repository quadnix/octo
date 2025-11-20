import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { IamRole } from '../iam-role.resource.js';
import type { IamRoleSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamRole)
export class UpdateIamRoleTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<IamRole> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<IamRole, DiffValueTypeTagUpdate>): Promise<IamRoleSchema['response']> {
    // Get properties.
    const role = diff.node;
    const properties = role.properties;
    const response = role.response;

    // `us-east-1` is the recommended region for global resources.
    await super.handle(diff, { ...properties, awsRegionId: 'us-east-1', resourceArn: response.Arn! });

    return response;
  }

  async mock(diff: Diff<IamRole, DiffValueTypeTagUpdate>): Promise<IamRoleSchema['response']> {
    const role = diff.node;
    return role.response;
  }
}

/**
 * @internal
 */
@Factory<UpdateIamRoleTagsResourceAction>(UpdateIamRoleTagsResourceAction)
export class UpdateIamRoleTagsResourceActionFactory {
  private static instance: UpdateIamRoleTagsResourceAction;

  static async create(): Promise<UpdateIamRoleTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateIamRoleTagsResourceAction(container);
    }
    return this.instance;
  }
}
