import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { Vpc } from '../vpc.resource.js';

@Action(Vpc)
export class UpdateVpcTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<Vpc> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.node as Vpc;
    const properties = vpc.properties;
    const response = vpc.response;

    await super.handle(diff, { ...properties, resourceArn: response.VpcArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.node as Vpc;
    const properties = vpc.properties;

    await super.mock(diff, properties);
  }
}

@Factory<UpdateVpcTagsResourceAction>(UpdateVpcTagsResourceAction)
export class UpdateVpcTagsResourceActionFactory {
  private static instance: UpdateVpcTagsResourceAction;

  static async create(): Promise<UpdateVpcTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateVpcTagsResourceAction(container);
    }
    return this.instance;
  }
}
