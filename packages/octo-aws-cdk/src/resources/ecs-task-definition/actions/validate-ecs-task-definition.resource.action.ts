import {
  DescribeTaskDefinitionCommand,
  type DescribeTaskDefinitionCommandOutput,
  ECSClient,
} from '@aws-sdk/client-ecs';
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
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

/**
 * @internal
 */
@Action(EcsTaskDefinition)
export class ValidateEcsTaskDefinitionResourceAction extends ANodeAction implements IResourceAction<EcsTaskDefinition> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof EcsTaskDefinition &&
      hasNodeName(diff.node, 'ecs-task-definition') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcsTaskDefinition>): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.node;
    const properties = ecsTaskDefinition.properties;
    const response = ecsTaskDefinition.response;
    const [matchingEcsTaskDefinitionIamRole, ...matchingEcsTaskDefinitionEfsList] = ecsTaskDefinition.parents;

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if Task Definition exists.
    let describeTaskDefinitionResult: DescribeTaskDefinitionCommandOutput | undefined;
    try {
      describeTaskDefinitionResult = await ecsClient.send(
        new DescribeTaskDefinitionCommand({
          taskDefinition: response.taskDefinitionArn!,
        }),
      );
    } catch (error: any) {
      throw new TransactionError(`ECS Task Definition with ARN ${response.taskDefinitionArn} does not exist!`);
    }

    if (!describeTaskDefinitionResult.taskDefinition) {
      throw new TransactionError(`ECS Task Definition with ARN ${response.taskDefinitionArn} does not exist!`);
    }

    const actualTaskDefinition = describeTaskDefinitionResult.taskDefinition;

    // Validate task definition status.
    if (actualTaskDefinition.status !== 'ACTIVE') {
      throw new TransactionError(
        `ECS Task Definition ${response.taskDefinitionArn} is not in ACTIVE status. Current status: ${actualTaskDefinition.status}`,
      );
    }

    // Validate task definition ARN.
    if (actualTaskDefinition.taskDefinitionArn !== response.taskDefinitionArn) {
      throw new TransactionError(
        `ECS Task Definition ARN mismatch. Expected: ${response.taskDefinitionArn}, Actual: ${actualTaskDefinition.taskDefinitionArn || 'undefined'}`,
      );
    }

    // Validate revision.
    if (actualTaskDefinition.revision !== response.revision) {
      throw new TransactionError(
        `ECS Task Definition revision mismatch. Expected: ${response.revision}, Actual: ${actualTaskDefinition.revision || 'undefined'}`,
      );
    }

    // Validate family.
    if (actualTaskDefinition.family !== properties.family) {
      throw new TransactionError(
        `ECS Task Definition family mismatch. Expected: ${properties.family}, Actual: ${actualTaskDefinition.family || 'undefined'}`,
      );
    }

    // Validate CPU.
    if (actualTaskDefinition.cpu !== String(properties.cpu)) {
      throw new TransactionError(
        `ECS Task Definition CPU mismatch. Expected: ${properties.cpu}, Actual: ${actualTaskDefinition.cpu || 'undefined'}`,
      );
    }

    // Validate memory.
    if (actualTaskDefinition.memory !== String(properties.memory)) {
      throw new TransactionError(
        `ECS Task Definition memory mismatch. Expected: ${properties.memory}, Actual: ${actualTaskDefinition.memory || 'undefined'}`,
      );
    }

    // Validate network mode.
    if (actualTaskDefinition.networkMode !== 'awsvpc') {
      throw new TransactionError(
        `ECS Task Definition network mode mismatch. Expected: awsvpc, Actual: ${actualTaskDefinition.networkMode || 'undefined'}`,
      );
    }

    // Validate requires compatibilities.
    if (!actualTaskDefinition.requiresCompatibilities?.includes('FARGATE')) {
      throw new TransactionError(
        `ECS Task Definition does not include FARGATE in requiresCompatibilities. Current: ${JSON.stringify(actualTaskDefinition.requiresCompatibilities)}`,
      );
    }

    // Validate task role ARN (from IAM role parent).
    const expectedTaskRoleArn = matchingEcsTaskDefinitionIamRole.getSchemaInstanceInResourceAction().response.Arn;
    if (actualTaskDefinition.taskRoleArn !== expectedTaskRoleArn) {
      throw new TransactionError(
        `ECS Task Definition task role ARN mismatch. Expected: ${expectedTaskRoleArn}, Actual: ${actualTaskDefinition.taskRoleArn || 'undefined'}`,
      );
    }

    // Validate container definitions count.
    if (
      !actualTaskDefinition.containerDefinitions ||
      actualTaskDefinition.containerDefinitions.length !== properties.images.length
    ) {
      throw new TransactionError(
        `ECS Task Definition container definitions count mismatch. Expected: ${properties.images.length}, Actual: ${actualTaskDefinition.containerDefinitions?.length || 0}`,
      );
    }

    // Validate each container definition.
    for (const expectedImage of properties.images) {
      const actualContainer = actualTaskDefinition.containerDefinitions!.find((c) => c.name === expectedImage.name);

      if (!actualContainer) {
        throw new TransactionError(`ECS Task Definition missing container: ${expectedImage.name}`);
      }

      // Validate image URI.
      if (actualContainer.image !== expectedImage.uri) {
        throw new TransactionError(
          `Container ${expectedImage.name} image URI mismatch. Expected: ${expectedImage.uri}, Actual: ${actualContainer.image || 'undefined'}`,
        );
      }

      // Validate essential.
      if (actualContainer.essential !== expectedImage.essential) {
        throw new TransactionError(
          `Container ${expectedImage.name} essential mismatch. Expected: ${expectedImage.essential}, Actual: ${actualContainer.essential}`,
        );
      }

      // Validate command.
      if (JSON.stringify(actualContainer.command) !== JSON.stringify(expectedImage.command)) {
        throw new TransactionError(
          `Container ${expectedImage.name} command mismatch. Expected: ${JSON.stringify(expectedImage.command)}, Actual: ${JSON.stringify(actualContainer.command)}`,
        );
      }

      // Validate port mappings.
      if (actualContainer.portMappings?.length !== expectedImage.ports.length) {
        throw new TransactionError(
          `Container ${expectedImage.name} port mappings count mismatch. Expected: ${expectedImage.ports.length}, Actual: ${actualContainer.portMappings?.length || 0}`,
        );
      }

      for (const expectedPort of expectedImage.ports) {
        const actualPort = actualContainer.portMappings?.find(
          (p) => p.containerPort === expectedPort.containerPort && p.protocol === expectedPort.protocol,
        );

        if (!actualPort) {
          throw new TransactionError(
            `Container ${expectedImage.name} missing port mapping: containerPort=${expectedPort.containerPort}, protocol=${expectedPort.protocol}`,
          );
        }

        if (actualPort.hostPort !== expectedPort.containerPort) {
          throw new TransactionError(
            `Container ${expectedImage.name} port ${expectedPort.containerPort} host port mismatch. Expected: ${expectedPort.containerPort}, Actual: ${actualPort.hostPort}`,
          );
        }
      }

      // Validate environment variables.
      if (actualContainer.environment?.length !== properties.environmentVariables.length) {
        throw new TransactionError(
          `Container ${expectedImage.name} environment variables count mismatch. Expected: ${properties.environmentVariables.length}, Actual: ${actualContainer.environment?.length || 0}`,
        );
      }

      for (const expectedEnv of properties.environmentVariables) {
        const actualEnv = actualContainer.environment?.find((e) => e.name === expectedEnv.name);

        if (!actualEnv) {
          throw new TransactionError(
            `Container ${expectedImage.name} missing environment variable: ${expectedEnv.name}`,
          );
        }

        if (actualEnv.value !== expectedEnv.value) {
          throw new TransactionError(
            `Container ${expectedImage.name} environment variable ${expectedEnv.name} value mismatch. Expected: ${expectedEnv.value}, Actual: ${actualEnv.value || 'undefined'}`,
          );
        }
      }

      // Validate mount points.
      if (actualContainer.mountPoints?.length !== matchingEcsTaskDefinitionEfsList.length) {
        throw new TransactionError(
          `Container ${expectedImage.name} mount points count mismatch. Expected: ${matchingEcsTaskDefinitionEfsList.length}, Actual: ${actualContainer.mountPoints?.length || 0}`,
        );
      }

      for (const efsParent of matchingEcsTaskDefinitionEfsList) {
        const filesystemName = efsParent.getSchemaInstance().properties.filesystemName;
        const actualMountPoint = actualContainer.mountPoints?.find((m) => m.sourceVolume === filesystemName);

        if (!actualMountPoint) {
          throw new TransactionError(
            `Container ${expectedImage.name} missing mount point for EFS volume: ${filesystemName}`,
          );
        }

        if (actualMountPoint.containerPath !== `/mnt/${filesystemName}`) {
          throw new TransactionError(
            `Container ${expectedImage.name} mount point ${filesystemName} container path mismatch. Expected: /mnt/${filesystemName}, Actual: ${actualMountPoint.containerPath || 'undefined'}`,
          );
        }

        if (actualMountPoint.readOnly !== false) {
          throw new TransactionError(
            `Container ${expectedImage.name} mount point ${filesystemName} readOnly mismatch. Expected: false, Actual: ${actualMountPoint.readOnly}`,
          );
        }
      }
    }

    // Validate volumes.
    if (actualTaskDefinition.volumes?.length !== matchingEcsTaskDefinitionEfsList.length) {
      throw new TransactionError(
        `ECS Task Definition volumes count mismatch. Expected: ${matchingEcsTaskDefinitionEfsList.length}, Actual: ${actualTaskDefinition.volumes?.length || 0}`,
      );
    }

    for (const efsParent of matchingEcsTaskDefinitionEfsList) {
      const filesystemName = efsParent.getSchemaInstance().properties.filesystemName;
      const expectedFileSystemId = efsParent.getSchemaInstanceInResourceAction().response.FileSystemId;
      const actualVolume = actualTaskDefinition.volumes?.find((v) => v.name === filesystemName);

      if (!actualVolume) {
        throw new TransactionError(`ECS Task Definition missing volume: ${filesystemName}`);
      }

      if (actualVolume.efsVolumeConfiguration?.fileSystemId !== expectedFileSystemId) {
        throw new TransactionError(
          `ECS Task Definition volume ${filesystemName} file system ID mismatch. Expected: ${expectedFileSystemId}, Actual: ${actualVolume.efsVolumeConfiguration?.fileSystemId || 'undefined'}`,
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateEcsTaskDefinitionResourceAction>(ValidateEcsTaskDefinitionResourceAction)
export class ValidateEcsTaskDefinitionResourceActionFactory {
  private static instance: ValidateEcsTaskDefinitionResourceAction;

  static async create(): Promise<ValidateEcsTaskDefinitionResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateEcsTaskDefinitionResourceAction();
    }
    return this.instance;
  }
}
