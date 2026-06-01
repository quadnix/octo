import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { RouteTableSchema } from '../index.schema.js';
import { RouteTable } from '../route-table.resource.js';

/**
 * @internal
 */
@Action(RouteTable)
export class CaptureRouteTableResponseResourceAction implements IResourceAction<RouteTable> {
  filter(diff: Diff): boolean {
    return diff.node instanceof RouteTable && hasNodeName(diff.node, 'route-table');
  }

  async handle(_diff: Diff<RouteTable>): Promise<void> {}

  async mock(
    _diff: Diff<RouteTable>,
    capture: Partial<RouteTableSchema['response']>,
  ): Promise<RouteTableSchema['response']> {
    return {
      RouteTableId: capture.RouteTableId,
      subnetAssociationId: capture.subnetAssociationId,
    };
  }
}

@Factory<CaptureRouteTableResponseResourceAction>(CaptureRouteTableResponseResourceAction)
export class CaptureRouteTableResponseResourceActionFactory {
  private static instance: CaptureRouteTableResponseResourceAction;

  static async create(): Promise<CaptureRouteTableResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureRouteTableResponseResourceAction();
    }
    return this.instance;
  }
}
