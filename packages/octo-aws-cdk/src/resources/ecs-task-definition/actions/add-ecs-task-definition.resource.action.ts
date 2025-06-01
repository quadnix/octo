import { ECSClient, type PortMapping, RegisterTaskDefinitionCommand } from '@aws-sdk/client-ecs';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import { EcsTaskDefinition } from '../ecs-task-definition.resource.js';
import type { EcsTaskDefinitionSchema } from '../index.schema.js';

@Action(EcsTaskDefinition)
export class AddEcsTaskDefinitionResourceAction implements IResourceAction<EcsTaskDefinition> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcsTaskDefinition &&
      (diff.node.constructor as typeof EcsTaskDefinition).NODE_NAME === 'ecs-task-definition' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.node as EcsTaskDefinition;
    const properties = ecsTaskDefinition.properties;
    const response = ecsTaskDefinition.response;
    const ecsTaskDefinitionIamRole = ecsTaskDefinition.parents[0];
    const ecsTaskDefinitionEfsList = ecsTaskDefinition.parents.slice(1) as (typeof ecsTaskDefinition.parents)[1][];

    // Get instances.
    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create a new task definition.
    const data = await ecsClient.send(
      new RegisterTaskDefinitionCommand({
        containerDefinitions: [
          {
            command: properties.image.command,
            environment: properties.environmentVariables,
            essential: true,
            image: properties.image.uri,
            mountPoints: ecsTaskDefinitionEfsList.map((efs) => ({
              containerPath: `/mnt/${efs.getSchemaInstance().properties.filesystemName}`,
              readOnly: false,
              sourceVolume: efs.getSchemaInstance().properties.filesystemName,
            })),
            name: properties.deploymentTag.replace(/\./g, '_'),
            portMappings: properties.image.ports.map(
              (i): PortMapping => ({
                containerPort: i.containerPort,
                hostPort: i.containerPort,
                protocol: i.protocol,
              }),
            ),
          },
        ],
        cpu: String(properties.cpu),
        family: properties.family,
        memory: String(properties.memory),
        networkMode: 'awsvpc',
        requiresCompatibilities: ['FARGATE'],
        taskRoleArn: ecsTaskDefinitionIamRole.getSchemaInstance().response.Arn,
        volumes: ecsTaskDefinitionEfsList.map((efs) => ({
          efsVolumeConfiguration: {
            fileSystemId: efs.getSchemaInstance().response.FileSystemId,
          },
          name: efs.getSchemaInstance().properties.filesystemName,
        })),
      }),
    );

    // Set response.
    response.revision = data.taskDefinition!.revision!;
    response.taskDefinitionArn = data.taskDefinition!.taskDefinitionArn!;
  }

  async mock(diff: Diff, capture: Partial<EcsTaskDefinitionSchema['response']>): Promise<void> {
    // Get properties.
    const ecsTaskDefinition = diff.node as EcsTaskDefinition;
    const properties = ecsTaskDefinition.properties;

    const ecsClient = await this.container.get<ECSClient, typeof ECSClientFactory>(ECSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ecsClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof RegisterTaskDefinitionCommand) {
        return { taskDefinition: { revision: capture.revision, taskDefinitionArn: capture.taskDefinitionArn } };
      }
    };
  }
}

@Factory<AddEcsTaskDefinitionResourceAction>(AddEcsTaskDefinitionResourceAction)
export class AddEcsTaskDefinitionResourceActionFactory {
  private static instance: AddEcsTaskDefinitionResourceAction;

  static async create(): Promise<AddEcsTaskDefinitionResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddEcsTaskDefinitionResourceAction(container);
    }
    return this.instance;
  }
}
