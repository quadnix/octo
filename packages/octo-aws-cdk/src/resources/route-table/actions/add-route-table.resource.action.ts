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

  async handle(diff: Diff<RouteTable>): Promise<void> {
    // Get properties.
    const routeTable = diff.node;
    const properties = routeTable.properties;
    const response = routeTable.response;
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
        TagSpecifications: [
          {
            ResourceType: 'route-table',
            Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
          },
        ],
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

    // Set response.
    const rtId = routeTableOutput!.RouteTable!.RouteTableId!;
    response.RouteTableArn = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:route-table/${rtId}`;
    response.RouteTableId = rtId;
    response.subnetAssociationId = data[0].AssociationId!;
  }

  async mock(diff: Diff<RouteTable>, capture: Partial<RouteTableSchema['response']>): Promise<void> {
    // Get properties.
    const routeTable = diff.node;
    const properties = routeTable.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
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
