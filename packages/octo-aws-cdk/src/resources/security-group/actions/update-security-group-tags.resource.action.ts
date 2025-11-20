import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import type { SecurityGroupSchema } from '../index.schema.js';
import { SecurityGroup } from '../security-group.resource.js';

/**
 * @internal
 */
@Action(SecurityGroup)
export class UpdateSecurityGroupTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<SecurityGroup>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<SecurityGroup, DiffValueTypeTagUpdate>): Promise<SecurityGroupSchema['response']> {
    // Get properties.
    const securityGroup = diff.node;
    const properties = securityGroup.properties;
    const response = securityGroup.response;

    await super.handle(diff, { ...properties, resourceArn: response.Arn! });

    return response;
  }

  async mock(diff: Diff<SecurityGroup, DiffValueTypeTagUpdate>): Promise<SecurityGroupSchema['response']> {
    const securityGroup = diff.node;
    return securityGroup.response;
  }
}

/**
 * @internal
 */
@Factory<UpdateSecurityGroupTagsResourceAction>(UpdateSecurityGroupTagsResourceAction)
export class UpdateSecurityGroupTagsResourceActionFactory {
  private static instance: UpdateSecurityGroupTagsResourceAction;

  static async create(): Promise<UpdateSecurityGroupTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateSecurityGroupTagsResourceAction(container);
    }
    return this.instance;
  }
}
