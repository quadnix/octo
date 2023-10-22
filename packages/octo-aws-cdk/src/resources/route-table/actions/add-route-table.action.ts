import {
  AssociateRouteTableCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IInternetGatewayResponse } from '../../internet-gateway/internet-gateway.interface.js';
import { InternetGateway } from '../../internet-gateway/internet-gateway.resource.js';
import { ISubnetResponse } from '../../subnet/subnet.interface.js';
import { Subnet } from '../../subnet/subnet.resource.js';
import { IVpcResponse } from '../../vpc/vpc.interface.js';
import { Vpc } from '../../vpc/vpc.resource.js';
import { IRouteTableResponse } from '../route-table.interface.js';
import { RouteTable } from '../route-table.resource.js';

export class AddRouteTableAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddRouteTableAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'route-table';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.model as RouteTable;
    const response = routeTable.response as unknown as IRouteTableResponse;

    const parents = routeTable.getParents();
    const vpc = parents['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;
    const internetGateway = parents['internet-gateway'][0].to as InternetGateway;
    const internetGatewayResponse = internetGateway.response as unknown as IInternetGatewayResponse;
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response as unknown as ISubnetResponse;

    // Create Route Table.
    const routeTableOutput = await this.ec2Client.send(
      new CreateRouteTableCommand({
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Associate RouteTable to Subnet and IGW.
    const data = await Promise.all([
      this.ec2Client.send(
        new AssociateRouteTableCommand({
          RouteTableId: routeTableOutput!.RouteTable!.RouteTableId,
          SubnetId: subnetResponse.SubnetId,
        }),
      ),
      this.ec2Client.send(
        new CreateRouteCommand({
          DestinationCidrBlock: '0.0.0.0/0',
          GatewayId: internetGatewayResponse.InternetGatewayId,
          RouteTableId: routeTableOutput!.RouteTable!.RouteTableId,
        }),
      ),
    ]);

    // Set response.
    response.RouteTableId = routeTableOutput!.RouteTable!.RouteTableId as string;
    response.subnetAssociationId = data[0].AssociationId as string;
  }
}
