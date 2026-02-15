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
  OverlayActionExceptionTransactionError,
  SubnetType,
  hasNodeName,
} from '@quadnix/octo';
import { EcsClusterSchema } from '../../../../../../resources/ecs-cluster/index.schema.js';
import { EcsService } from '../../../../../../resources/ecs-service/index.js';
import { EcsTaskDefinition } from '../../../../../../resources/ecs-task-definition/index.js';
import { EfsSchema } from '../../../../../../resources/efs/index.schema.js';
import { IamRoleSchema } from '../../../../../../resources/iam-role/index.schema.js';
import { SecurityGroupSchema } from '../../../../../../resources/security-group/index.schema.js';
import { SubnetSchema } from '../../../../../../resources/subnet/index.schema.js';
import type { AwsEcsExecutionModule } from '../../../aws-ecs-execution.module.js';
import { AwsEcsExecutionOverlay } from '../aws-ecs-execution.overlay.js';

/**
 * @internal
 */
@Action(AwsEcsExecutionOverlay)
export class AddAwsEcsExecutionOverlayAction implements IModelAction<AwsEcsExecutionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsExecutionOverlay &&
      hasNodeName(diff.node, 'aws-ecs-execution-overlay') &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff<AwsEcsExecutionOverlay>,
    actionInputs: EnhancedModuleSchema<AwsEcsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const awsExecutionOverlay = diff.node;
    const properties = awsExecutionOverlay.properties;

    const subnet = actionInputs.inputs.subnet;
    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const [
      matchingMainIamRoleAnchor,
      ecsExecutionAnchor,
      matchingEcsClusterAnchor,
      securityGroupAnchor,
      ...matchingSubnetLocalFilesystemMountAnchors
    ] = awsExecutionOverlay.anchors;

    const ecsClusterAnchorProperties = matchingEcsClusterAnchor.getSchemaInstance().properties;
    const mainIamRoleProperties = matchingMainIamRoleAnchor.getSchemaInstance().properties;

    // Calculate final environment variables.
    const environmentVariables: { name: string; value: string }[] = Object.keys(
      ecsClusterAnchorProperties.environmentVariables,
    ).map((key) => ({
      name: key,
      value: ecsClusterAnchorProperties.environmentVariables[key],
    }));
    for (const key of Object.keys(ecsExecutionAnchor.properties.environmentVariables)) {
      const value = ecsExecutionAnchor.properties.environmentVariables[key];
      const keyIndex = environmentVariables.findIndex((e) => e.name === key);
      if (keyIndex !== -1) {
        environmentVariables[keyIndex].value = value;
      } else {
        environmentVariables.push({ name: key, value });
      }
    }

    // Get matching main IAM role resource.
    const [matchingMainIamRoleResource] = await awsExecutionOverlay.getResourcesMatchingSchema(IamRoleSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'rolename', value: mainIamRoleProperties.iamRoleName },
    ]);
    if (!matchingMainIamRoleResource) {
      throw new OverlayActionExceptionTransactionError(
        `IamRole "${mainIamRoleProperties.iamRoleName}" not found in "${awsAccountId}"!`,
        diff,
        this.constructor.name,
      );
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
        throw new OverlayActionExceptionTransactionError(
          `Filesystem "${subnetFilesystemMountAnchorProperties.filesystemName}" not found in "${awsRegionId}"!`,
          diff,
          this.constructor.name,
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
        cpu: properties.deploymentContainerProperties.cpu,
        deploymentTag: properties.deploymentTag,
        environmentVariables,
        family: `${properties.environmentName}-${properties.subnetId}-${properties.serverKey}`,
        images: properties.deploymentContainerProperties.images,
        memory: properties.deploymentContainerProperties.memory,
      },
      [matchingMainIamRoleResource, ...efsList],
    );

    // Get matching ECS Cluster resource.
    const [matchingEcsClusterResource] = await awsExecutionOverlay.getResourcesMatchingSchema(EcsClusterSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
      { key: 'clusterName', value: ecsClusterAnchorProperties.clusterName },
    ]);
    if (!matchingEcsClusterResource) {
      throw new OverlayActionExceptionTransactionError(
        `ECS Cluster "${ecsClusterAnchorProperties.clusterName}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    // Get matching Subnet resource.
    const [matchingSubnetResource] = await awsExecutionOverlay.getResourcesMatchingSchema(SubnetSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
      { key: 'subnetName', value: subnet.subnetName },
    ]);
    if (!matchingSubnetResource) {
      throw new OverlayActionExceptionTransactionError(
        `Subnet "${subnet.subnetName}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    // Get matching execution's SecurityGroup resources - server, sidecar server, and execution SGs.
    const execution = securityGroupAnchor.getParent() as Execution;
    const matchingExecutionSGResources = await execution.getResourcesMatchingSchema(SecurityGroupSchema, [], [], {
      searchBoundaryMembers: false,
    });
    if (matchingExecutionSGResources.length !== 2 + actionInputs.inputs.deployments.sidecars.length) {
      throw new OverlayActionExceptionTransactionError(
        'One or more security groups from main server, sidecar server, and/or execution not found!',
        diff,
        this.constructor.name,
      );
    }

    // Create ECS Service.
    const ecsService = new EcsService(
      `ecs-service-${properties.executionId}`,
      {
        assignPublicIp: properties.subnetType === SubnetType.PUBLIC ? 'ENABLED' : 'DISABLED',
        awsAccountId,
        awsRegionId,
        desiredCount: ecsExecutionAnchor.properties.desiredCount,
        loadBalancers: [],
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

/**
 * @internal
 */
@Factory<AddAwsEcsExecutionOverlayAction>(AddAwsEcsExecutionOverlayAction)
export class AddAwsEcsExecutionOverlayActionFactory {
  private static instance: AddAwsEcsExecutionOverlayAction;

  static async create(): Promise<AddAwsEcsExecutionOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsExecutionOverlayAction();
    }
    return this.instance;
  }
}
