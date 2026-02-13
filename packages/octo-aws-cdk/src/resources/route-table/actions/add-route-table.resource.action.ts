import {
  AssociateRouteTableCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { RouteTableSchema } from '../index.schema.js';
import { RouteTable } from '../route-table.resource.js';

/**
 * @internal
 */
@Action(RouteTable)
export class AddRouteTableResourceAction implements IResourceAction<RouteTable> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof RouteTable &&
      hasNodeName(diff.node, 'route-table') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<RouteTable>): Promise<RouteTableSchema['response']> {
    // Get properties.
    const routeTable = diff.node;
    const properties = routeTable.properties;
    const tags = routeTable.tags;
    const routeTableVpc = routeTable.parents[0];
    const routeTableInternetGateway = routeTable.parents[1];
    const routeTableSubnet = routeTable.parents[2];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create Route Table.
    const routeTableOutput = await ec2Client.send(
      new CreateRouteTableCommand({
        TagSpecifications:
          Object.keys(tags).length > 0
            ? [
                {
                  ResourceType: 'route-table',
                  Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
                },
              ]
            : undefined,
        VpcId: routeTableVpc.getSchemaInstanceInResourceAction().response.VpcId,
      }),
    );

    // Associate RouteTable to Subnet and IGW.
    const data = await Promise.all([
      ec2Client.send(
        new AssociateRouteTableCommand({
          RouteTableId: routeTableOutput!.RouteTable!.RouteTableId,
          SubnetId: routeTableSubnet.getSchemaInstanceInResourceAction().response.SubnetId,
        }),
      ),
      properties.associateWithInternetGateway
        ? ec2Client.send(
            new CreateRouteCommand({
              DestinationCidrBlock: '0.0.0.0/0',
              GatewayId: routeTableInternetGateway.getSchemaInstanceInResourceAction().response.InternetGatewayId,
              RouteTableId: routeTableOutput!.RouteTable!.RouteTableId,
            }),
          )
        : Promise.resolve(),
    ]);

    const rtId = routeTableOutput!.RouteTable!.RouteTableId!;
    return {
      RouteTableArn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:route-table/${rtId}`,
      RouteTableId: rtId,
      subnetAssociationId: data[0].AssociationId!,
    };
  }

  async mock(
    diff: Diff<RouteTable>,
    capture: Partial<RouteTableSchema['response']>,
  ): Promise<RouteTableSchema['response']> {
    // Get properties.
    const routeTable = diff.node;
    const properties = routeTable.properties;

    return {
      RouteTableArn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:route-table/${capture.RouteTableId}`,
      RouteTableId: capture.RouteTableId!,
      subnetAssociationId: capture.subnetAssociationId!,
    };
  }
}

/**
 * @internal
 */
@Factory<AddRouteTableResourceAction>(AddRouteTableResourceAction)
export class AddRouteTableResourceActionFactory {
  private static instance: AddRouteTableResourceAction;

  static async create(): Promise<AddRouteTableResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddRouteTableResourceAction(container);
    }
    return this.instance;
  }
}
