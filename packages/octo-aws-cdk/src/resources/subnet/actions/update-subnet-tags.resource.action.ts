import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { Subnet } from '../subnet.resource.js';

/**
 * @internal
 */
@Action(Subnet)
export class UpdateSubnetTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<Subnet> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<Subnet, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const subnet = diff.node;
    const properties = subnet.properties;
    const response = subnet.response;

    await super.handle(diff, { ...properties, resourceArn: response.SubnetArn! });
  }
}

/**
 * @internal
 */
@Factory<UpdateSubnetTagsResourceAction>(UpdateSubnetTagsResourceAction)
export class UpdateSubnetTagsResourceActionFactory {
  private static instance: UpdateSubnetTagsResourceAction;

  static async create(): Promise<UpdateSubnetTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateSubnetTagsResourceAction(container);
    }
    return this.instance;
  }
}
