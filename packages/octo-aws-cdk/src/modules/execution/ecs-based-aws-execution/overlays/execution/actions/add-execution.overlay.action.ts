import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  type Execution,
  Factory,
  type IModelAction,
  MatchingResource,
  type Server,
  SubnetType,
} from '@quadnix/octo';
import { EcsClusterSchema } from '../../../../../../resources/ecs-cluster/index.schema.js';
import { EcsService } from '../../../../../../resources/ecs-service/index.js';
import { EcsTaskDefinition } from '../../../../../../resources/ecs-task-definition/index.js';
import { EfsSchema } from '../../../../../../resources/efs/index.schema.js';
import { IamRoleSchema } from '../../../../../../resources/iam-role/index.schema.js';
import { SecurityGroupSchema } from '../../../../../../resources/security-group/index.schema.js';
import { SubnetSchema } from '../../../../../../resources/subnet/index.schema.js';
import type { AwsExecutionModule } from '../../../aws-execution.module.js';
import { AwsExecutionOverlay } from '../aws-execution.overlay.js';

@Action(AwsExecutionOverlay)
export class AddExecutionOverlayAction implements IModelAction<AwsExecutionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsExecutionOverlay &&
      (diff.node.constructor as typeof AwsExecutionOverlay).NODE_NAME === 'execution-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const awsExecutionOverlay = diff.node as AwsExecutionOverlay;
    const properties = awsExecutionOverlay.properties;

    const subnet = actionInputs.inputs.subnet;
    const { awsAccountId, awsRegionId } = actionInputs.metadata as Awaited<
      ReturnType<AwsExecutionModule['registerMetadata']>
    >;

    const [
      matchingIamRoleAnchor,
      matchingTaskDefinitionAnchor,
      ecsServiceAnchor,
      executionAnchor,
      matchingEcsClusterAnchor,
      executionSGAnchor,
      matchingServerSGAnchor,
      ...matchingSubnetLocalFilesystemMountAnchors
    ] = awsExecutionOverlay.anchors;
    const ecsClusterAnchorProperties = matchingEcsClusterAnchor.getSchemaInstance().properties;
    const iamRoleProperties = matchingIamRoleAnchor.getSchemaInstance().properties;
    const taskDefinitionAnchorProperties = matchingTaskDefinitionAnchor.getSchemaInstance().properties;

    // Calculate final environment variables.
    const environmentVariables: { name: string; value: string }[] = Object.keys(
      ecsClusterAnchorProperties.environmentVariables,
    ).map((key) => ({
      name: key,
      value: ecsClusterAnchorProperties.environmentVariables[key],
    }));
    for (const key of Object.keys(executionAnchor.properties.environmentVariables)) {
      const value = executionAnchor.properties.environmentVariables[key];
      const keyIndex = environmentVariables.findIndex((e) => e.name === key);
      if (keyIndex !== -1) {
        environmentVariables[keyIndex].value = value;
      } else {
        environmentVariables.push({ name: key, value });
      }
    }

    // Get matching IAM role resource.
    const [matchingIamRoleResource] = await awsExecutionOverlay.getResourcesMatchingSchema(IamRoleSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'rolename', value: iamRoleProperties.iamRoleName },
    ]);
    if (!matchingIamRoleResource) {
      throw new Error(`IamRole "${iamRoleProperties.iamRoleName}" not found in "${awsAccountId}"!`);
    }

    // Get matching EFS resources based on mounts of subnet.
    const efsList: MatchingResource<EfsSchema>[] = [];
    for (const matchingSubnetLocalFilesystemMountAnchor of matchingSubnetLocalFilesystemMountAnchors) {
      const subnetFilesystemMountAnchorProperties =
        matchingSubnetLocalFilesystemMountAnchor.getSchemaInstance().properties;
      const [matchingEfsResource] = await awsExecutionOverlay.getResourcesMatchingSchema(
        EfsSchema,
        [
          { key: 'awsRegionId', value: awsRegionId },
          { key: 'filesystemName', value: subnetFilesystemMountAnchorProperties.filesystemName },
        ],
        [],
      );
      if (!matchingEfsResource) {
        throw new Error(
          `Filesystem "${subnetFilesystemMountAnchorProperties.filesystemName}" not found in "${awsRegionId}"!`,
        );
      }

      efsList.push(matchingEfsResource);
    }

    // Create ECS Task Definition.
    const ecsTaskDefinition = new EcsTaskDefinition(
      `ecs-task-definition-${properties.executionId}`,
      {
        awsAccountId,
        awsRegionId,
        cpu: properties.deploymentContainerProperties.cpu || taskDefinitionAnchorProperties.cpu,
        deploymentTag: properties.deploymentTag,
        environmentVariables,
        family: `${properties.environmentName}-${properties.subnetId}-${properties.serverKey}`,
        image: {
          command: (
            properties.deploymentContainerProperties.image?.command || taskDefinitionAnchorProperties.image.command
          ).split(' '),
          ports: (
            properties.deploymentContainerProperties.image?.ports || taskDefinitionAnchorProperties.image.ports
          ).map((p) => ({
            containerPort: p.containerPort,
            protocol: p.protocol,
          })),
          uri: taskDefinitionAnchorProperties.image.uri,
        },
        memory: properties.deploymentContainerProperties.memory || taskDefinitionAnchorProperties.memory,
      },
      [matchingIamRoleResource, ...efsList],
    );

    // Get matching ECS Cluster resource.
    const [matchingEcsClusterResource] = await awsExecutionOverlay.getResourcesMatchingSchema(EcsClusterSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
      { key: 'clusterName', value: ecsClusterAnchorProperties.clusterName },
    ]);
    if (!matchingEcsClusterResource) {
      throw new Error(`ECS Cluster "${ecsClusterAnchorProperties.clusterName}" not found!`);
    }

    // Get matching Subnet resource.
    const [matchingSubnetResource] = await awsExecutionOverlay.getResourcesMatchingSchema(SubnetSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
      { key: 'subnetName', value: subnet.subnetName },
    ]);
    if (!matchingSubnetResource) {
      throw new Error(`Subnet "${subnet.subnetName}" not found!`);
    }

    // Get matching execution's SecurityGroup resources - server and execution SGs.
    const server = matchingServerSGAnchor.getActual().getParent() as Server;
    const execution = executionSGAnchor.getParent() as Execution;
    const matchingExecutionSGResources = await execution.getResourcesMatchingSchema(SecurityGroupSchema, [], [], {
      searchBoundaryMembers: false,
    });
    if (matchingExecutionSGResources.length !== 2) {
      throw new Error(
        `SecurityGroup for server "${server.serverKey}", or execution "${execution.executionId}" not found!`,
      );
    }

    // Create ECS Service.
    const ecsService = new EcsService(
      `ecs-service-${properties.executionId}`,
      {
        assignPublicIp: properties.subnetType === SubnetType.PUBLIC ? 'ENABLED' : 'DISABLED',
        awsAccountId,
        awsRegionId,
        desiredCount: ecsServiceAnchor.properties.desiredCount,
        serviceName: properties.executionId.replace(/\./g, '_'),
      },
      [
        matchingEcsClusterResource,
        new MatchingResource(ecsTaskDefinition),
        matchingSubnetResource,
        ...matchingExecutionSGResources,
      ],
    );

    actionOutputs[ecsTaskDefinition.resourceId] = ecsTaskDefinition;
    actionOutputs[ecsService.resourceId] = ecsService;
    return actionOutputs;
  }
}

@Factory<AddExecutionOverlayAction>(AddExecutionOverlayAction)
export class AddExecutionOverlayActionFactory {
  private static instance: AddExecutionOverlayAction;

  static async create(): Promise<AddExecutionOverlayAction> {
    if (!this.instance) {
      this.instance = new AddExecutionOverlayAction();
    }
    return this.instance;
  }
}
