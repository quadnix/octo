import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import type { VpcSchema } from '../index.schema.js';
import { Vpc } from '../vpc.resource.js';

/**
 * @internal
 */
@Action(Vpc)
export class UpdateVpcTagsResourceAction extends GenericResourceTaggingAction implements IResourceAction<Vpc> {
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<Vpc, DiffValueTypeTagUpdate>): Promise<VpcSchema['response']> {
    // Get properties.
    const vpc = diff.node;
    const properties = vpc.properties;
    const response = vpc.response;

    await super.handle(diff, { ...properties, resourceArn: response.VpcArn! });

    return response;
  }

  async mock(diff: Diff<Vpc, DiffValueTypeTagUpdate>): Promise<VpcSchema['response']> {
    const vpc = diff.node;
    return vpc.response;
  }
}

/**
 * @internal
 */
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
