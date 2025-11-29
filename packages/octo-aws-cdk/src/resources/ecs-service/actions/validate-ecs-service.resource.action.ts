import { DescribeServicesCommand, type DescribeServicesCommandOutput, ECSClient } from '@aws-sdk/client-ecs';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import type { AlbTargetGroupSchema } from '../../alb-target-group/index.schema.js';
import type { SecurityGroupSchema } from '../../security-group/index.schema.js';
import { EcsService } from '../ecs-service.resource.js';

/**
 * @internal
 */
@Action(EcsService)
export class ValidateEcsServiceResourceAction extends ANodeAction implements IResourceAction<EcsService> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof EcsService &&
      hasNodeName(diff.node, 'ecs-service') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsService>): Promise<void> {
    // Get properties.
    const ecsService = diff.node;
    const properties = ecsService.properties;
    const response = ecsService.response;
    const ecsServiceEcsCluster = ecsService.parents[0];
    const ecsServiceTaskDefinition = ecsService.parents[1];
    const ecsServiceSubnet = ecsService.parents[2];
    const ecsServiceTargetGroupList = ecsService.parents
      .slice(3)
      .filter((p) => hasNodeName(p.getActual(), 'alb-target-group')) as MatchingResource<AlbTargetGroupSchema>[];
    const ecsServiceSecurityGroupList = ecsService.parents
      .slice(3)
      .filter((p) => hasNodeName(p.getActual(), 'security-group')) as MatchingResource<SecurityGroupSchema>[];

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if ECS Service exists.
    const clusterName = ecsServiceEcsCluster.getSchemaInstanceInResourceAction().properties.clusterName;
    let describeServicesResult: DescribeServicesCommandOutput | undefined;
    try {
      describeServicesResult = await ecsClient.send(
        new DescribeServicesCommand({
          cluster: clusterName,
          services: [response.serviceArn!],
        }),
      );
    } catch (error: any) {
      throw new TransactionError(`ECS Service with ARN ${response.serviceArn} does not exist!`);
    }

    if (!describeServicesResult.services || describeServicesResult.services.length === 0) {
      throw new TransactionError(`ECS Service with ARN ${response.serviceArn} does not exist!`);
    }

    const actualService = describeServicesResult.services[0];

    // Validate service status.
    if (actualService.status !== 'ACTIVE') {
      throw new TransactionError(
        `ECS Service ${response.serviceArn} is not in ACTIVE status. Current status: ${actualService.status}`,
      );
    }

    // Validate service ARN.
    if (actualService.serviceArn !== response.serviceArn) {
      throw new TransactionError(
        `ECS Service ARN mismatch. Expected: ${response.serviceArn}, Actual: ${actualService.serviceArn || 'undefined'}`,
      );
    }

    // Validate service name.
    if (actualService.serviceName !== properties.serviceName) {
      throw new TransactionError(
        `ECS Service name mismatch. Expected: ${properties.serviceName}, Actual: ${actualService.serviceName || 'undefined'}`,
      );
    }

    // Validate cluster ARN.
    const expectedClusterArn = ecsServiceEcsCluster.getSchemaInstanceInResourceAction().response.clusterArn;
    if (actualService.clusterArn !== expectedClusterArn) {
      throw new TransactionError(
        `ECS Service cluster ARN mismatch. Expected: ${expectedClusterArn}, Actual: ${actualService.clusterArn || 'undefined'}`,
      );
    }

    // Validate desired count.
    if (actualService.desiredCount !== properties.desiredCount) {
      throw new TransactionError(
        `ECS Service desired count mismatch. Expected: ${properties.desiredCount}, Actual: ${actualService.desiredCount || 'undefined'}`,
      );
    }

    // Validate launch type.
    if (actualService.launchType !== 'FARGATE') {
      throw new TransactionError(
        `ECS Service launch type mismatch. Expected: FARGATE, Actual: ${actualService.launchType || 'undefined'}`,
      );
    }

    // Validate task definition.
    const expectedTaskDefinitionArn =
      ecsServiceTaskDefinition.getSchemaInstanceInResourceAction().response.taskDefinitionArn;
    if (actualService.taskDefinition !== expectedTaskDefinitionArn) {
      throw new TransactionError(
        `ECS Service task definition mismatch. Expected: ${expectedTaskDefinitionArn}, Actual: ${actualService.taskDefinition || 'undefined'}`,
      );
    }

    // Validate network configuration.
    const actualNetworkConfig = actualService.networkConfiguration?.awsvpcConfiguration;
    if (!actualNetworkConfig) {
      throw new TransactionError('ECS Service does not have awsvpc network configuration!');
    }

    // Validate subnet.
    const expectedSubnetId = ecsServiceSubnet.getSchemaInstanceInResourceAction().response.SubnetId;
    if (!actualNetworkConfig.subnets?.includes(expectedSubnetId)) {
      throw new TransactionError(
        `ECS Service subnet mismatch. Expected: ${expectedSubnetId}, Actual subnets: ${JSON.stringify(actualNetworkConfig.subnets)}`,
      );
    }

    // Validate security groups.
    const expectedSecurityGroupIds = ecsServiceSecurityGroupList.map(
      (sg) => sg.getSchemaInstanceInResourceAction().response.GroupId,
    );
    const actualSecurityGroupIds = actualNetworkConfig.securityGroups || [];

    if (actualSecurityGroupIds.length !== expectedSecurityGroupIds.length) {
      throw new TransactionError(
        `ECS Service security groups count mismatch. Expected: ${expectedSecurityGroupIds.length}, Actual: ${actualSecurityGroupIds.length}`,
      );
    }

    for (const expectedSgId of expectedSecurityGroupIds) {
      if (!actualSecurityGroupIds.includes(expectedSgId)) {
        throw new TransactionError(
          `ECS Service missing security group: ${expectedSgId}. Current security groups: ${JSON.stringify(actualSecurityGroupIds)}`,
        );
      }
    }

    // Validate assign public IP.
    if (actualNetworkConfig.assignPublicIp !== properties.assignPublicIp) {
      throw new TransactionError(
        `ECS Service assignPublicIp mismatch. Expected: ${properties.assignPublicIp}, Actual: ${actualNetworkConfig.assignPublicIp || 'undefined'}`,
      );
    }

    // Validate load balancers.
    if (actualService.loadBalancers?.length !== properties.loadBalancers.length) {
      throw new TransactionError(
        `ECS Service load balancers count mismatch. Expected: ${properties.loadBalancers.length}, Actual: ${actualService.loadBalancers?.length || 0}`,
      );
    }

    for (const expectedLb of properties.loadBalancers) {
      const expectedTargetGroupArn = ecsServiceTargetGroupList
        .find((tg) => tg.getSchemaInstanceInResourceAction().properties.Name === expectedLb.targetGroupName)!
        .getSchemaInstanceInResourceAction().response.TargetGroupArn;

      const actualLb = actualService.loadBalancers?.find(
        (lb) =>
          lb.targetGroupArn === expectedTargetGroupArn &&
          lb.containerName === expectedLb.containerName &&
          lb.containerPort === expectedLb.containerPort,
      );

      if (!actualLb) {
        throw new TransactionError(
          `ECS Service missing load balancer configuration: targetGroup=${expectedLb.targetGroupName}, container=${expectedLb.containerName}, port=${expectedLb.containerPort}`,
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateEcsServiceResourceAction>(ValidateEcsServiceResourceAction)
export class ValidateEcsServiceResourceActionFactory {
  private static instance: ValidateEcsServiceResourceAction;

  static async create(): Promise<ValidateEcsServiceResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateEcsServiceResourceAction();
    }
    return this.instance;
  }
}

