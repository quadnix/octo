import { Action, Container, type Diff, Factory, type IResourceAction } from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { Efs } from '../efs.resource.js';

@Action(Efs)
export class UpdateEfsTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<Efs> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.node as Efs;
    const properties = efs.properties;
    const response = efs.response;

    await super.handle(diff, { ...properties, resourceArn: response.FileSystemArn! });
  }

  override async mock(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.node as Efs;
    const properties = efs.properties;

    await super.mock(diff, properties);
  }
}

@Factory<UpdateEfsTagsResourceAction>(UpdateEfsTagsResourceAction)
export class UpdateEfsTagsResourceActionFactory {
  private static instance: UpdateEfsTagsResourceAction;

  static async create(): Promise<UpdateEfsTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateEfsTagsResourceAction(container);
    }
    return this.instance;
  }
}
