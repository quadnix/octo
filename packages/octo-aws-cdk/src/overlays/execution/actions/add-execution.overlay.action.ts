import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  type Diff,
  DiffAction,
  Factory,
  type IModelAction,
  TransactionError,
} from '@quadnix/octo';
import { EcsServiceAnchor } from '../../../anchors/ecs-service.anchor.js';
import { EnvironmentVariablesAnchor } from '../../../anchors/environment-variables.anchor.js';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../../anchors/subnet-filesystem-mount.anchor.js';
import { TaskDefinitionAnchor } from '../../../anchors/task-definition.anchor.js';
import type { AwsEnvironment } from '../../../models/environment/aws.environment.model.js';
import type { AwsExecution } from '../../../models/execution/aws.execution.model.js';
import type { EcsCluster } from '../../../resources/ecs-cluster/index.js';
import { EcsService } from '../../../resources/ecs-service/index.js';
import { EcsTaskDefinition } from '../../../resources/ecs-task-definition/index.js';
import type { Efs } from '../../../resources/efs/index.js';
import type { IamRole } from '../../../resources/iam-role/index.js';
import { SecurityGroup } from '../../../resources/security-group/index.js';
import type { Subnet } from '../../../resources/subnet/index.js';
import { ExecutionOverlay } from '../execution.overlay.js';

@Action(ExecutionOverlay)
export class AddExecutionOverlayAction implements IModelAction {
  collectInput(diff: Diff): string[] {
    const executionOverlay = diff.node as ExecutionOverlay;
    const properties = executionOverlay.properties;

    const clusterName = [properties.regionId, properties.environmentName].join('-');

    const serverIamRoleAnchor = executionOverlay.getAnchors().find((a) => a instanceof IamRoleAnchor) as IamRoleAnchor;
    const serverIamRoleName = serverIamRoleAnchor.properties.iamRoleName;

    const efsResources = executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SubnetFilesystemMountAnchor)
      .map((a: SubnetFilesystemMountAnchor) => `resource.efs-${properties.regionId}-${a.properties.filesystemName}`);

    const securityGroupResources = executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SecurityGroupAnchor && a.properties.rules.length > 0)
      .map((a: SecurityGroupAnchor) => `resource.sec-grp-${a.properties.securityGroupName}`);

    return [
      `resource.ecs-cluster-${clusterName}`,
      `resource.iam-role-${serverIamRoleName}`,
      `resource.subnet-${properties.subnetId}`,
      ...efsResources,
      ...securityGroupResources,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof ExecutionOverlay &&
      (diff.node.constructor as typeof ExecutionOverlay).NODE_NAME === 'execution-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    // Get properties.
    const executionOverlay = diff.node as ExecutionOverlay;
    const properties = executionOverlay.properties;

    // ECS Service Anchors.
    const ecsServiceAnchor = executionOverlay
      .getAnchors()
      .find((a) => a instanceof EcsServiceAnchor) as EcsServiceAnchor;
    const ecsServiceAnchorProperties = ecsServiceAnchor.properties;

    // ECS TaskDefinition Anchors.
    const taskDefinitionAnchor = executionOverlay
      .getAnchors()
      .find((a) => a instanceof TaskDefinitionAnchor) as TaskDefinitionAnchor;
    const taskDefinitionAnchorProperties = taskDefinitionAnchor.properties;

    // Environment Variables Anchors.
    const environmentVariables: { name: string; value: string }[] = [];
    // Iterate through every EV anchors associated with this overlay to collect final environment variables.
    executionOverlay
      .getAnchors()
      .filter((a) => a instanceof EnvironmentVariablesAnchor)
      .forEach((a: EnvironmentVariablesAnchor) => {
        const parent = a.getParent() as AwsEnvironment | AwsExecution;
        parent.environmentVariables.forEach((value: string, key: string) => {
          const keyIndex = environmentVariables.findIndex((e) => e.name === key);
          if (keyIndex !== -1) {
            environmentVariables[keyIndex].value = value;
          } else {
            environmentVariables.push({ name: key, value });
          }
        });
      });

    // IAM Role Anchors - collect server iam role.
    const serverIamRoleAnchor = executionOverlay.getAnchors().find((a) => a instanceof IamRoleAnchor) as IamRoleAnchor;
    const serverIamRoleName = serverIamRoleAnchor.properties.iamRoleName;
    const serverIamRole = actionInputs[`resource.iam-role-${serverIamRoleName}`] as IamRole;

    // Add EcsTaskDefinition parents.
    const taskDefinitionParents: [IamRole, ...Efs[]] = [serverIamRole];
    // EFS Mount Anchors.
    // Iterate through every filesystem mount associated with this overlay to add respective EFS as parent.
    executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SubnetFilesystemMountAnchor)
      .forEach((a: SubnetFilesystemMountAnchor) => {
        const efs = actionInputs[`resource.efs-${properties.regionId}-${a.properties.filesystemName}`] as Efs;
        taskDefinitionParents.push(efs);
      });

    // Create ECS Task Definition.
    const ecsTaskDefinition = new EcsTaskDefinition(
      `ecs-task-definition-${properties.regionId}-${properties.serverKey}-${properties.deploymentTag}`,
      {
        awsRegionId: properties.awsRegionId,
        cpu: taskDefinitionAnchorProperties.cpu,
        deploymentTag: properties.deploymentTag,
        environmentVariables,
        image: {
          command: taskDefinitionAnchorProperties.image.command.split(' '),
          ports: taskDefinitionAnchorProperties.image.ports.map((p) => ({
            containerPort: p.containerPort,
            protocol: p.protocol,
          })),
          uri: taskDefinitionAnchorProperties.image.uri,
        },
        memory: taskDefinitionAnchorProperties.memory,
        serverKey: properties.serverKey,
      },
      taskDefinitionParents,
    );
    actionOutputs[ecsTaskDefinition.resourceId] = ecsTaskDefinition;

    const clusterName = [properties.regionId, properties.environmentName].join('-');
    const ecsCluster = actionInputs[`resource.ecs-cluster-${clusterName}`] as EcsCluster;
    const subnet = actionInputs[`resource.subnet-${properties.subnetId}`] as Subnet;

    // Add EcsService parents.
    const ecsServiceParents: [EcsCluster, EcsTaskDefinition, Subnet, ...SecurityGroup[]] = [
      ecsCluster,
      ecsTaskDefinition,
      subnet,
    ];
    // Security Group Anchors.
    // Iterate though every security group anchors associated with this overlay to add respective SG as parent.
    executionOverlay
      .getAnchors()
      .filter((a) => a instanceof SecurityGroupAnchor && a.properties.rules.length > 0)
      .forEach((a: SecurityGroupAnchor) => {
        const securityGroup = actionInputs[`resource.sec-grp-${a.properties.securityGroupName}`] as SecurityGroup;
        ecsServiceParents.push(securityGroup);
      });

    // Ensure there are no more than 5 security groups.
    if (ecsServiceParents.filter((p) => p instanceof SecurityGroup).length > 5) {
      throw new TransactionError('Cannot have more than 5 security groups in ECS Service!');
    }

    // Create ECS Service.
    const ecsService = new EcsService(
      `ecs-service-${properties.regionId}-${properties.serverKey}`,
      {
        awsRegionId: properties.awsRegionId,
        desiredCount: ecsServiceAnchorProperties.desiredCount,
        serviceName: properties.executionId.replace(/\./g, '_'),
      },
      ecsServiceParents,
    );
    actionOutputs[ecsService.resourceId] = ecsService;

    return actionOutputs;
  }
}

@Factory<AddExecutionOverlayAction>(AddExecutionOverlayAction)
export class AddExecutionOverlayActionFactory {
  static async create(): Promise<AddExecutionOverlayAction> {
    return new AddExecutionOverlayAction();
  }
}
