import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { InternetGateway } from '../internet-gateway.resource.js';

/**
 * @internal
 */
@Action(InternetGateway)
export class UpdateInternetGatewayTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<InternetGateway>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const igw = diff.node as InternetGateway;
    const properties = igw.properties;
    const response = igw.response;

    await super.handle(diff, { ...properties, resourceArn: response.InternetGatewayArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const igw = diff.node as InternetGateway;
    const properties = igw.properties;

    await super.mock(diff, properties);
  }
}

/**
 * @internal
 */
@Factory<UpdateInternetGatewayTagsResourceAction>(UpdateInternetGatewayTagsResourceAction)
export class UpdateInternetGatewayTagsResourceActionFactory {
  private static instance: UpdateInternetGatewayTagsResourceAction;

  static async create(): Promise<UpdateInternetGatewayTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateInternetGatewayTagsResourceAction(container);
    }
    return this.instance;
  }
}
