import { CreateRouteCommand, DeleteRouteCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  type AResource,
  Action,
  Container,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  hasNodeName,
} from '@quadnix/octo';
import { type EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import type { NatGatewaySchema } from '../../nat-gateway/index.schema.js';
import { RouteTable } from '../route-table.resource.js';

/**
 * @internal
 */
@Action(RouteTable)
export class UpdateNatGatewayParentInRouteTableResourceAction implements IResourceAction<RouteTable> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff<any, AResource<NatGatewaySchema, any>>): boolean {
    return (
      (diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE || diff.action === DiffAction.UPDATE) &&
      diff.node instanceof RouteTable &&
      hasNodeName(diff.node, 'route-table') &&
      diff.field === 'parent' &&
      hasNodeName(diff.value, 'nat-gateway')
    );
  }

  async handle(diff: Diff<RouteTable, AResource<NatGatewaySchema, any>>): Promise<void> {
    // Get properties.
    const routeTable = diff.node;
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
      await RetryUtility.retryPromise(
        async (): Promise<boolean> => {
          await ec2Client.send(
            new CreateRouteCommand({
              DestinationCidrBlock: '0.0.0.0/0',
              NatGatewayId: diff.value.response.NatGatewayId,
              RouteTableId: response.RouteTableId,
            }),
          );
          return true;
        },
        {
          initialDelayInMs: 1000,
          maxRetries: 5,
          retryDelayInMs: 5000,
          throwOnError: false,
        },
      );
    }
  }
}

/**
 * @internal
 */
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
