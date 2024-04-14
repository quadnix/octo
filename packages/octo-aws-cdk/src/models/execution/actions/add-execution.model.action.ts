import {
  Action,
  ActionInputs,
  ActionOutputs,
  Deployment,
  Diff,
  DiffAction,
  Environment,
  Execution,
  Factory,
  IModelAction,
  ModelType,
  Server,
} from '@quadnix/octo';
import { EcrImage } from '../../../resources/ecr/ecr-image.resource.js';
import { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import { EcsService } from '../../../resources/ecs/ecs-service.resource.js';
import { EcsTaskDefinition } from '../../../resources/ecs/ecs-task-definition.resource.js';
import { Efs } from '../../../resources/efs/efs.resource.js';
import { IamRole } from '../../../resources/iam/iam-role.resource.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { AwsRegion } from '../../region/aws.region.model.js';

@Action(ModelType.MODEL)
export class AddExecutionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddExecutionModelAction';

  collectInput(diff: Diff): string[] {
    const execution = diff.model as Execution;
    const deployment = execution.getParents()['deployment'][0].to as Deployment;
    const server = deployment.getParents()['server'][0].to as Server;
    const serverIamRoleName = server.getAnchors()[0].anchorId;
    const environment = execution.getParents()['environment'][0].to as Environment;
    const region = environment.getParents()['region'][0].to as AwsRegion;

    const clusterName = [region.regionId, environment.environmentName].join('-');
    const image = execution.image;
    const serviceName = ['service', server.serverKey].join('-');

    return [
      `input.ecs.${clusterName}.${serviceName}.desiredCount`,
      `input.image.${image.imageId}.command`,
      `input.image.${image.imageId}.ports`,
      `resource.ecr-${region.awsRegionId}-${image.imageId}`,
      `resource.ecs-cluster-${clusterName}`,
      `resource.efs-${region.regionId}-filesystem`,
      `resource.iam-role-${serverIamRoleName}`,
      `resource.subnet-${region.regionId}-private-1`,
      `resource.sec-grp-${region.regionId}-internal-open`,
      `resource.sec-grp-${region.regionId}-private-closed`,
    ];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'execution' && diff.field === 'executionId';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    // Get properties.
    const execution = diff.model as Execution;
    const deployment = execution.getParents()['deployment'][0].to as Deployment;
    const server = deployment.getParents()['server'][0].to as Server;
    const serverIamRoleName = server.getAnchors()[0].anchorId;
    const environment = execution.getParents()['environment'][0].to as Environment;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const image = execution.image;

    const clusterName = [region.regionId, environment.environmentName].join('-');
    const environmentVariables: { name: string; value: string }[] = [];
    execution.environmentVariables.forEach((value: string, key: string) => {
      environmentVariables.push({ name: key, value });
    });
    const serviceName = ['service', server.serverKey].join('-');

    // Get inputs.
    const desiredCount = actionInputs[`input.ecs.${clusterName}.${serviceName}.desiredCount`] as string;
    const command = actionInputs[`input.image.${image.imageId}.command`] as string;
    const ports = (actionInputs[`input.image.${image.imageId}.ports`] as string).split(',').map((s) => Number(s));
    const ecrImage = actionInputs[`resource.ecr-${region.awsRegionId}-${image.imageId}`] as EcrImage;
    const ecsCluster = actionInputs[`resource.ecs-cluster-${clusterName}`] as EcsCluster;
    const efs = actionInputs[`resource.efs-${region.regionId}-filesystem`] as Efs;
    const iamRole = actionInputs[`resource.iam-role-${serverIamRoleName}`] as IamRole;
    const subnet = actionInputs[`resource.subnet-${region.regionId}-private-1`] as Subnet;
    const internalOpenSG = actionInputs[`resource.sec-grp-${region.regionId}-internal-open`] as SecurityGroup;
    const privateClosedSG = actionInputs[`resource.sec-grp-${region.regionId}-private-closed`] as SecurityGroup;

    const ecsTaskDefinition = new EcsTaskDefinition(
      `ecs-task-definition-${server.serverKey}`,
      {
        awsRegionId: region.awsRegionId,
        environment: environmentVariables,
        image: {
          command: command.split(' '),
          ports: ports.map((p) => ({ containerPort: p, protocol: 'tcp' })),
        },
        serverKey: server.serverKey,
      },
      [ecrImage, efs, iamRole],
    );

    const ecsService = new EcsService(
      `ecs-service-${server.serverKey}`,
      {
        awsRegionId: region.awsRegionId,
        desiredCount: Number(desiredCount),
        serviceName: ['service', server.serverKey].join('-'),
      },
      [ecsCluster, ecsTaskDefinition, subnet, internalOpenSG, privateClosedSG],
    );

    const output: ActionOutputs = {};
    output[ecsTaskDefinition.resourceId] = ecsTaskDefinition;
    output[ecsService.resourceId] = ecsService;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddExecutionModelAction>(AddExecutionModelAction)
export class AddExecutionModelActionFactory {
  static async create(): Promise<AddExecutionModelAction> {
    return new AddExecutionModelAction();
  }
}
