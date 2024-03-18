import { ECSClient, PortMapping, RegisterTaskDefinitionCommand } from '@aws-sdk/client-ecs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IEcsTaskDefinitionProperties, IEcsTaskDefinitionResponse } from '../ecs-task-definition.interface.js';
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';

@Action(ModelType.RESOURCE)
export class AddEcsTaskDefinitionResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcsTaskDefinitionResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'ecs-task-definition';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.model as EcsTaskDefinition;
    const properties = ecsTaskDefinition.properties as unknown as IEcsTaskDefinitionProperties;
    const response = ecsTaskDefinition.response as unknown as IEcsTaskDefinitionResponse;

    // Get instances.
    const ecsClient = await Container.get(ECSClient, { args: [properties.awsRegionId] });

    // Create a new task definition.
    const data = await ecsClient.send(
      new RegisterTaskDefinitionCommand({
        containerDefinitions: [
          {
            command: properties.image.command,
            environment: properties.environment,
            essential: true,
            image: properties.image.uri,
            mountPoints: [
              {
                containerPath: '/mnt/shared-filesystem',
                readOnly: false,
                sourceVolume: 'shared-filesystem',
              },
            ],
            name: properties.serverKey,
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
        taskRoleArn: properties.taskRoleArn,
        volumes: [
          {
            efsVolumeConfiguration: {
              fileSystemId: properties.efsFileSystemId,
            },
            name: 'shared-filesystem',
          },
        ],
      }),
    );

    // Set response.
    response.revision = data.taskDefinition!.revision as number;
    response.taskDefinitionArn = data.taskDefinition!.taskDefinitionArn as string;
  }
}

@Factory<AddEcsTaskDefinitionResourceAction>(AddEcsTaskDefinitionResourceAction)
export class AddEcsTaskDefinitionResourceActionFactory {
  static async create(): Promise<AddEcsTaskDefinitionResourceAction> {
    return new AddEcsTaskDefinitionResourceAction();
  }
}
