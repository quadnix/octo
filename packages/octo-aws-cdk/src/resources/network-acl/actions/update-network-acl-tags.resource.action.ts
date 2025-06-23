import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { NetworkAcl } from '../network-acl.resource.js';

@Action(NetworkAcl)
export class UpdateNetworkAclTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<NetworkAcl>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const nacl = diff.node as NetworkAcl;
    const properties = nacl.properties;
    const response = nacl.response;

    await super.handle(diff, { ...properties, resourceArn: response.NetworkAclArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const nacl = diff.node as NetworkAcl;
    const properties = nacl.properties;

    await super.mock(diff, properties);
  }
}

@Factory<UpdateNetworkAclTagsResourceAction>(UpdateNetworkAclTagsResourceAction)
export class UpdateNetworkAclTagsResourceActionFactory {
  private static instance: UpdateNetworkAclTagsResourceAction;

  static async create(): Promise<UpdateNetworkAclTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateNetworkAclTagsResourceAction(container);
    }
    return this.instance;
  }
}
