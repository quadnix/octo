import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import type { NatGatewaySchema } from '../index.schema.js';
import { NatGateway } from '../nat-gateway.resource.js';

/**
 * @internal
 */
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

  override async handle(diff: Diff<NatGateway, DiffValueTypeTagUpdate>): Promise<NatGatewaySchema['response']> {
    // Get properties.
    const nat = diff.node;
    const properties = nat.properties;
    const response = nat.response;

    await super.handle(diff, { ...properties, resourceArn: response.NatGatewayArn! });

    return response;
  }

  async mock(diff: Diff<NatGateway, DiffValueTypeTagUpdate>): Promise<NatGatewaySchema['response']> {
    const nat = diff.node;
    return nat.response;
  }
}

/**
 * @internal
 */
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
