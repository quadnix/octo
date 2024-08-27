import {
  AssociateRouteTableCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import type { InternetGateway } from '../../internet-gateway/internet-gateway.resource.js';
import type { Subnet } from '../../subnet/subnet.resource.js';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { IRouteTableResponse } from '../route-table.interface.js';
import { RouteTable } from '../route-table.resource.js';

@Action(NodeType.RESOURCE)
export class AddRouteTableResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddRouteTableResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.node instanceof RouteTable && diff.node.NODE_NAME === 'route-table';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.node as RouteTable;
    const properties = routeTable.properties;
    const response = routeTable.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    const parents = routeTable.getParents();
    const vpc = parents['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response;
    const internetGateway = parents['internet-gateway'][0].to as InternetGateway;
    const internetGatewayResponse = internetGateway.response;
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response;

    // Create Route Table.
    const routeTableOutput = await ec2Client.send(
      new CreateRouteTableCommand({
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Associate RouteTable to Subnet and IGW.
    const data = await Promise.all([
      ec2Client.send(
        new AssociateRouteTableCommand({
          RouteTableId: routeTableOutput!.RouteTable!.RouteTableId,
          SubnetId: subnetResponse.SubnetId,
        }),
      ),
      properties.associateWithInternetGateway
        ? ec2Client.send(
            new CreateRouteCommand({
              DestinationCidrBlock: '0.0.0.0/0',
              GatewayId: internetGatewayResponse.InternetGatewayId,
              RouteTableId: routeTableOutput!.RouteTable!.RouteTableId,
            }),
          )
        : Promise.resolve(),
    ]);

    // Set response.
    response.RouteTableId = routeTableOutput!.RouteTable!.RouteTableId!;
    response.subnetAssociationId = data[0].AssociationId!;
  }

  async mock(capture: Partial<IRouteTableResponse>): Promise<void> {
    const ec2Client = await Container.get(EC2Client);
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateRouteTableCommand) {
        return { RouteTable: { RouteTableId: capture.RouteTableId } };
      } else if (instance instanceof AssociateRouteTableCommand) {
        return { AssociationId: capture.subnetAssociationId };
      } else if (instance instanceof CreateRouteCommand) {
        return;
      }
    };
  }
}

@Factory<AddRouteTableResourceAction>(AddRouteTableResourceAction)
export class AddRouteTableResourceActionFactory {
  static async create(): Promise<AddRouteTableResourceAction> {
    return new AddRouteTableResourceAction();
  }
}
