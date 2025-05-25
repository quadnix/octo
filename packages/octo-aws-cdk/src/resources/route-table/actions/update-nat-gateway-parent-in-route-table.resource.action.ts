import { CreateRouteCommand, DeleteRouteCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  type AResource,
  Action,
  type BaseResourceSchema,
  Container,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { type EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RouteTable } from '../route-table.resource.js';

@Action(RouteTable)
export class UpdateNatGatewayParentInRouteTableResourceAction implements IResourceAction<RouteTable> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      (diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE || diff.action === DiffAction.UPDATE) &&
      diff.node instanceof RouteTable &&
      (diff.node.constructor as typeof RouteTable).NODE_NAME === 'route-table' &&
      diff.field === 'parent'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.node as RouteTable;
    const properties = routeTable.properties;
    const response = routeTable.response;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // First delete the existing NAT Gateway route in the route-table.
    if (diff.action === DiffAction.DELETE || diff.action === DiffAction.UPDATE) {
      await ec2Client.send(
        new DeleteRouteCommand({
          DestinationCidrBlock: '0.0.0.0/0',
          RouteTableId: response.RouteTableId,
        }),
      );
    }
    // Then, create a new NAT Gateway route in the route-table.
    if (diff.action === DiffAction.ADD || diff.action === DiffAction.UPDATE) {
      await ec2Client.send(
        new CreateRouteCommand({
          DestinationCidrBlock: '0.0.0.0/0',
          NatGatewayId: (diff.value as AResource<BaseResourceSchema, any>).response.NatGatewayId as string,
          RouteTableId: response.RouteTableId,
        }),
      );
    }
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const routeTable = diff.node as RouteTable;
    const properties = routeTable.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteRouteCommand) {
        return;
      } else if (instance instanceof CreateRouteCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateNatGatewayParentInRouteTableResourceAction>(UpdateNatGatewayParentInRouteTableResourceAction)
export class UpdateNatGatewayParentInRouteTableResourceActionFactory {
  private static instance: UpdateNatGatewayParentInRouteTableResourceAction;

  static async create(): Promise<UpdateNatGatewayParentInRouteTableResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateNatGatewayParentInRouteTableResourceAction(container);
    }
    return this.instance;
  }
}
