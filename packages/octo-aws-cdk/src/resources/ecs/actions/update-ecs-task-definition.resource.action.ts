import {
  DeleteTaskDefinitionsCommand,
  DeregisterTaskDefinitionCommand,
  ECSClient,
  type PortMapping,
  RegisterTaskDefinitionCommand,
} from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IEfsProperties, IEfsResponse } from '../../efs/efs.interface.js';
import type { Efs } from '../../efs/efs.resource.js';
import type { IIamRoleResponse } from '../../iam/iam-role.interface.js';
import type { IamRole } from '../../iam/iam-role.resource.js';
import type { IEcsTaskDefinitionProperties, IEcsTaskDefinitionResponse } from '../ecs-task-definition.interface.js';
import type { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

@Action(ModelType.RESOURCE)
export class UpdateEcsTaskDefinitionResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateEcsTaskDefinitionResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.UPDATE && diff.model.MODEL_NAME === 'ecs-task-definition';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.model as EcsTaskDefinition;
    const parents = ecsTaskDefinition.getParents();
    const properties = ecsTaskDefinition.properties as unknown as IEcsTaskDefinitionProperties;
    const response = ecsTaskDefinition.response as unknown as IEcsTaskDefinitionResponse;

    const efsList = 'efs' in parents ? parents['efs'].map((d) => d.to as Efs) : [];

    const iamRole = parents['iam-role'][0].to as IamRole;
    const iamRoleResponse = iamRole.response as unknown as IIamRoleResponse;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Create a new task definition.
    const data = await ecsClient.send(
      new RegisterTaskDefinitionCommand({
        containerDefinitions: [
          {
            command: properties.image.command,
            environment: properties.environmentVariables,
            essential: true,
            image: properties.image.uri,
            mountPoints: efsList.map((efs: Efs) => ({
              containerPath: `/mnt/${(efs.properties as unknown as IEfsProperties).filesystemName}`,
              readOnly: false,
              sourceVolume: (efs.properties as unknown as IEfsProperties).filesystemName,
            })),
            name: properties.deploymentTag,
            portMappings: properties.image.ports.map(
              (i): PortMapping => ({
                containerPort: i.containerPort,
                hostPort: 0,
                protocol: i.protocol,
              }),
            ),
          },
        ],
        executionRoleArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
        family: properties.serverKey,
        networkMode: 'awsvpc',
        taskRoleArn: iamRoleResponse.Arn,
        volumes: efsList.map((efs: Efs) => ({
          efsVolumeConfiguration: {
            fileSystemId: (efs.response as unknown as IEfsResponse).FileSystemId,
          },
          name: (efs.properties as unknown as IEfsProperties).filesystemName,
        })),
      }),
    );

    // Deregister the old task definition.
    await ecsClient.send(
      new DeregisterTaskDefinitionCommand({
        taskDefinition: response.taskDefinitionArn,
      }),
    );
    // Delete the old task definition.
    const deleteTaskDefinitionResponse = await ecsClient.send(
      new DeleteTaskDefinitionsCommand({
        taskDefinitions: [response.taskDefinitionArn],
      }),
    );

    // Ensure there are no failures during deletion of old task definition.
    if (deleteTaskDefinitionResponse.failures && deleteTaskDefinitionResponse.failures.length > 0) {
      const error = new Error('Error while deleting task definition!');
      error['data'] = deleteTaskDefinitionResponse.failures;
      console.error(error);
    }

    // Set response.
    response.revision = data.taskDefinition!.revision as number;
    response.taskDefinitionArn = data.taskDefinition!.taskDefinitionArn as string;
  }
}

@Factory<UpdateEcsTaskDefinitionResourceAction>(UpdateEcsTaskDefinitionResourceAction)
export class UpdateEcsTaskDefinitionResourceActionFactory {
  static async create(): Promise<UpdateEcsTaskDefinitionResourceAction> {
    return new UpdateEcsTaskDefinitionResourceAction();
  }
}
