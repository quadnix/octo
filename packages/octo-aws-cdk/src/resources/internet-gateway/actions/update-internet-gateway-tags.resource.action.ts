import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import type { InternetGatewaySchema } from '../index.schema.js';
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

  override async handle(
    diff: Diff<InternetGateway, DiffValueTypeTagUpdate>,
  ): Promise<InternetGatewaySchema['response']> {
    // Get properties.
    const igw = diff.node;
    const properties = igw.properties;
    const response = igw.response;

    await super.handle(diff, { ...properties, resourceArn: response.InternetGatewayArn! });

    return response;
  }

  async mock(diff: Diff<InternetGateway, DiffValueTypeTagUpdate>): Promise<InternetGatewaySchema['response']> {
    const igw = diff.node;
    return igw.response;
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
