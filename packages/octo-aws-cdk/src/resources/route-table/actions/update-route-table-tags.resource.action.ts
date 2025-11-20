import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import type { RouteTableSchema } from '../index.schema.js';
import { RouteTable } from '../route-table.resource.js';

/**
 * @internal
 */
@Action(RouteTable)
export class UpdateRouteTableTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<RouteTable>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<RouteTable, DiffValueTypeTagUpdate>): Promise<RouteTableSchema['response']> {
    // Get properties.
    const routeTable = diff.node;
    const properties = routeTable.properties;
    const response = routeTable.response;

    await super.handle(diff, { ...properties, resourceArn: response.RouteTableArn! });

    return response;
  }

  async mock(diff: Diff<RouteTable, DiffValueTypeTagUpdate>): Promise<RouteTableSchema['response']> {
    const routeTable = diff.node;
    return routeTable.response;
  }
}

/**
 * @internal
 */
@Factory<UpdateRouteTableTagsResourceAction>(UpdateRouteTableTagsResourceAction)
export class UpdateRouteTableTagsResourceActionFactory {
  private static instance: UpdateRouteTableTagsResourceAction;

  static async create(): Promise<UpdateRouteTableTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateRouteTableTagsResourceAction(container);
    }
    return this.instance;
  }
}
