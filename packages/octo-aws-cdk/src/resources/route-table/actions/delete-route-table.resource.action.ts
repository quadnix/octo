import { DeleteRouteTableCommand, DisassociateRouteTableCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { RouteTable } from '../route-table.resource.js';

@Action(RouteTable)
export class DeleteRouteTableResourceAction implements IResourceAction<RouteTable> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof RouteTable &&
      (diff.node.constructor as typeof RouteTable).NODE_NAME === 'route-table'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.node as RouteTable;
    const properties = routeTable.properties;
    const response = routeTable.response;

    // Get instances.
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    // Delete RouteTable to Subnet association.
    await ec2Client.send(
      new DisassociateRouteTableCommand({
        AssociationId: response.subnetAssociationId,
      }),
    );

    // Delete Route Table.
    await ec2Client.send(
      new DeleteRouteTableCommand({
        RouteTableId: response.RouteTableId,
      }),
    );
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.node as RouteTable;
    const properties = routeTable.properties;

    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DisassociateRouteTableCommand) {
        return;
      } else if (instance instanceof DeleteRouteTableCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteRouteTableResourceAction>(DeleteRouteTableResourceAction)
export class DeleteRouteTableResourceActionFactory {
  static async create(): Promise<DeleteRouteTableResourceAction> {
    const container = Container.getInstance();
    return new DeleteRouteTableResourceAction(container);
  }
}
