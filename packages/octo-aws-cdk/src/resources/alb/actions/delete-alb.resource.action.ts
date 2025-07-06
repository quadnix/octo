import { DeleteLoadBalancerCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { Alb } from '../alb.resource.js';

/**
 * @internal
 */
@Action(Alb)
export class DeleteAlbResourceAction implements IResourceAction<Alb> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof Alb &&
      (diff.node.constructor as typeof Alb).NODE_NAME === 'alb' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const alb = diff.node as Alb;
    const properties = alb.properties;
    const response = alb.response;

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete ALB with retry
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        await elbv2Client.send(
          new DeleteLoadBalancerCommand({
            LoadBalancerArn: response.LoadBalancerArn,
          }),
        );
        return true;
      },
      {
        initialDelayInMs: 0,
        maxRetries: 10,
        retryDelayInMs: 5000,
        throwOnError: false,
      },
    );
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const alb = diff.node as Alb;
    const properties = alb.properties;

    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    elbv2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteLoadBalancerCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<DeleteAlbResourceAction>(DeleteAlbResourceAction)
export class DeleteAlbResourceActionFactory {
  private static instance: DeleteAlbResourceAction;

  static async create(): Promise<DeleteAlbResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteAlbResourceAction(container);
    }
    return this.instance;
  }
}
