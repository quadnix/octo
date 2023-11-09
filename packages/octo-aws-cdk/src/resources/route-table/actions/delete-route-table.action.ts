import { DeleteRouteTableCommand, DisassociateRouteTableCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IRouteTableProperties, IRouteTableResponse } from '../route-table.interface.js';
import { RouteTable } from '../route-table.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteRouteTableAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteRouteTableAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'route-table';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.model as RouteTable;
    const properties = routeTable.properties as unknown as IRouteTableProperties;
    const response = routeTable.response as unknown as IRouteTableResponse;

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
}

@Factory<DeleteRouteTableAction>(DeleteRouteTableAction)
export class DeleteRouteTableActionFactory {
  static async create(): Promise<DeleteRouteTableAction> {
    return new DeleteRouteTableAction();
  }
}
