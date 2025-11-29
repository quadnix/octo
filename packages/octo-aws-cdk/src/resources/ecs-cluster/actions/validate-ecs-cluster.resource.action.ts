import { DescribeClustersCommand, type DescribeClustersCommandOutput, ECSClient } from '@aws-sdk/client-ecs';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

/**
 * @internal
 */
@Action(EcsCluster)
export class ValidateEcsClusterResourceAction extends ANodeAction implements IResourceAction<EcsCluster> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof EcsCluster &&
      hasNodeName(diff.node, 'ecs-cluster') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsCluster>): Promise<void> {
    // Get properties.
    const ecsCluster = diff.node;
    const properties = ecsCluster.properties;
    const response = ecsCluster.response;

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if ECS Cluster exists.
    let describeClustersResult: DescribeClustersCommandOutput | undefined;
    try {
      describeClustersResult = await ecsClient.send(
        new DescribeClustersCommand({
          clusters: [response.clusterArn!],
        }),
      );
    } catch (error: any) {
      throw new TransactionError(`ECS Cluster with ARN ${response.clusterArn} does not exist!`);
    }

    if (!describeClustersResult.clusters || describeClustersResult.clusters.length === 0) {
      throw new TransactionError(`ECS Cluster with ARN ${response.clusterArn} does not exist!`);
    }

    const actualCluster = describeClustersResult.clusters[0];

    // Validate cluster status.
    if (actualCluster.status !== 'ACTIVE') {
      throw new TransactionError(
        `ECS Cluster ${response.clusterArn} is not in ACTIVE status. Current status: ${actualCluster.status}`,
      );
    }

    // Validate cluster ARN.
    if (actualCluster.clusterArn !== response.clusterArn) {
      throw new TransactionError(
        `ECS Cluster ARN mismatch. Expected: ${response.clusterArn}, Actual: ${actualCluster.clusterArn || 'undefined'}`,
      );
    }

    // Validate cluster name.
    if (actualCluster.clusterName !== properties.clusterName) {
      throw new TransactionError(
        `ECS Cluster name mismatch. Expected: ${properties.clusterName}, Actual: ${actualCluster.clusterName || 'undefined'}`,
      );
    }

    // Validate ARN format (account and region should match).
    const expectedArnPrefix = `arn:aws:ecs:${properties.awsRegionId}:${properties.awsAccountId}:cluster/`;
    if (!response.clusterArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `ECS Cluster ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.clusterArn}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateEcsClusterResourceAction>(ValidateEcsClusterResourceAction)
export class ValidateEcsClusterResourceActionFactory {
  private static instance: ValidateEcsClusterResourceAction;

  static async create(): Promise<ValidateEcsClusterResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateEcsClusterResourceAction();
    }
    return this.instance;
  }
}

