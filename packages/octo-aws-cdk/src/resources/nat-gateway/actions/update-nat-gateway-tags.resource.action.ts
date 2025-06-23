import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { NatGateway } from '../nat-gateway.resource.js';

@Action(NatGateway)
export class UpdateNatGatewayTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<NatGateway>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const nat = diff.node as NatGateway;
    const properties = nat.properties;
    const response = nat.response;

    await super.handle(diff, { ...properties, resourceArn: response.NatGatewayArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const nat = diff.node as NatGateway;
    const properties = nat.properties;

    await super.mock(diff, properties);
  }
}

@Factory<UpdateNatGatewayTagsResourceAction>(UpdateNatGatewayTagsResourceAction)
export class UpdateNatGatewayTagsResourceActionFactory {
  private static instance: UpdateNatGatewayTagsResourceAction;

  static async create(): Promise<UpdateNatGatewayTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateNatGatewayTagsResourceAction(container);
    }
    return this.instance;
  }
}
