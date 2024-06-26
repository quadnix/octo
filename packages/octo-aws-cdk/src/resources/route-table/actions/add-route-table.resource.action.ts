import {
  AssociateRouteTableCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { IInternetGatewayResponse } from '../../internet-gateway/internet-gateway.interface.js';
import type { InternetGateway } from '../../internet-gateway/internet-gateway.resource.js';
import type { ISubnetResponse } from '../../subnet/subnet.interface.js';
import type { Subnet } from '../../subnet/subnet.resource.js';
import type { IVpcResponse } from '../../vpc/vpc.interface.js';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { IRouteTableProperties, IRouteTableResponse } from '../route-table.interface.js';
import type { RouteTable } from '../route-table.resource.js';

@Action(ModelType.RESOURCE)
export class AddRouteTableResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddRouteTableResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'route-table';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.model as RouteTable;
    const properties = routeTable.properties as unknown as IRouteTableProperties;
    const response = routeTable.response as unknown as IRouteTableResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    const parents = routeTable.getParents();
    const vpc = parents['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;
    const internetGateway = parents['internet-gateway'][0].to as InternetGateway;
    const internetGatewayResponse = internetGateway.response as unknown as IInternetGatewayResponse;
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response as unknown as ISubnetResponse;

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
    response.RouteTableId = routeTableOutput!.RouteTable!.RouteTableId as string;
    response.subnetAssociationId = data[0].AssociationId as string;
  }
}

@Factory<AddRouteTableResourceAction>(AddRouteTableResourceAction)
export class AddRouteTableResourceActionFactory {
  static async create(): Promise<AddRouteTableResourceAction> {
    return new AddRouteTableResourceAction();
  }
}
