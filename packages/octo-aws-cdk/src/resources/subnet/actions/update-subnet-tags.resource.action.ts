import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { Subnet } from '../subnet.resource.js';

@Action(Subnet)
export class UpdateSubnetTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<Subnet> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;
    const response = subnet.response;

    await super.handle(diff, { ...properties, resourceArn: response.SubnetArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;

    await super.mock(diff, properties);
  }
}

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
