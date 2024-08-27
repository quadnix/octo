import { DeleteRouteTableCommand, DisassociateRouteTableCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { RouteTable } from '../route-table.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteRouteTableResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteRouteTableResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.node instanceof RouteTable && diff.node.NODE_NAME === 'route-table'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.node as RouteTable;
    const properties = routeTable.properties;
    const response = routeTable.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

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

  async mock(): Promise<void> {
    const ec2Client = await Container.get(EC2Client);
    ec2Client.send = async (instance): Promise<unknown> => {
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
    return new DeleteRouteTableResourceAction();
  }
}
