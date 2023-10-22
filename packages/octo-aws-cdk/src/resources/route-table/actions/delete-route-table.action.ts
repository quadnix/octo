import { DeleteRouteTableCommand, DisassociateRouteTableCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IRouteTableResponse } from '../route-table.interface.js';
import { RouteTable } from '../route-table.resource.js';

export class DeleteRouteTableAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteRouteTableAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'route-table';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.model as RouteTable;
    const response = routeTable.response as unknown as IRouteTableResponse;

    // Delete RouteTable to Subnet association.
    await this.ec2Client.send(
      new DisassociateRouteTableCommand({
        AssociationId: response.subnetAssociationId,
      }),
    );

    // Delete Route Table.
    await this.ec2Client.send(
      new DeleteRouteTableCommand({
        RouteTableId: response.RouteTableId,
      }),
    );
  }
}
