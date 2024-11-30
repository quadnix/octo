import {
  AssociateRouteTableCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { InternetGateway } from '../../internet-gateway/index.js';
import type { Subnet } from '../../subnet/index.js';
import type { Vpc } from '../../vpc/index.js';
import { RouteTable } from '../route-table.resource.js';
import type { RouteTableSchema } from '../route-table.schema.js';

@Action(RouteTable)
export class AddRouteTableResourceAction implements IResourceAction<RouteTable> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
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

  async mock(diff: Diff, capture: Partial<RouteTableSchema['response']>): Promise<void> {
    // Get properties.
    const routeTable = diff.node as RouteTable;
    const properties = routeTable.properties;

    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
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
    const container = Container.getInstance();
    return new AddRouteTableResourceAction(container);
  }
}
