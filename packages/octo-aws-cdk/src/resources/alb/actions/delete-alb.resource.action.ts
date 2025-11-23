import {
  DeleteLoadBalancerCommand,
  DescribeLoadBalancersCommand,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { Alb } from '../alb.resource.js';

/**
 * @internal
 */
@Action(Alb)
export class DeleteAlbResourceAction extends ANodeAction implements IResourceAction<Alb> {
  actionTimeoutInMs: number = 180000; // 3 minutes.

  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof Alb &&
      hasNodeName(diff.node, 'alb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Alb>): Promise<void> {
    // Get properties.
    const alb = diff.node;
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
        this.log('Attempting to delete ALB.');

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

    // Wait for ALB to be deleted.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        this.log('Waiting for ALB to be deleted.');

        try {
          const result = await elbv2Client.send(
            new DescribeLoadBalancersCommand({
              LoadBalancerArns: [response.LoadBalancerArn!],
            }),
          );

          return !result.LoadBalancers || result.LoadBalancers.length === 0;
        } catch (error) {
          if (error.name === 'LoadBalancerNotFoundException') {
            return true;
          } else {
            throw error;
          }
        }
      },
      {
        initialDelayInMs: 0,
        maxRetries: 6,
        retryDelayInMs: 10000,
        throwOnError: false,
      },
    );
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
      this.instance = new DeleteAlbResourceAction();
    }
    return this.instance;
  }
}
