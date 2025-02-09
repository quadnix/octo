import { CreateRepositoryCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { EcrImage } from '../ecr-image.resource.js';
import type { EcrImageSchema } from '../ecr-image.schema.js';

@Action(EcrImage)
export class AddEcrImageResourceAction implements IResourceAction<EcrImage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcrImage &&
      (diff.node.constructor as typeof EcrImage).NODE_NAME === 'ecr-image' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.node as EcrImage;
    const properties = ecrImage.properties;
    const response = ecrImage.response;

    // Get instances.
    const ecrClient = await this.container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create a new repository.
    const data = await ecrClient.send(
      new CreateRepositoryCommand({
        imageScanningConfiguration: {
          scanOnPush: false,
        },
        imageTagMutability: 'IMMUTABLE',
        repositoryName: properties.imageId,
      }),
    );

    // Set response.
    response.registryId = data.repository!.registryId!;
    response.repositoryArn = data.repository!.repositoryArn!;
    response.repositoryName = data.repository!.repositoryName!;
    response.repositoryUri = data.repository!.repositoryUri!;
  }

  async mock(diff: Diff, capture: Partial<EcrImageSchema['response']>): Promise<void> {
    // Get properties.
    const ecrImage = diff.node as EcrImage;
    const properties = ecrImage.properties;

    const ecrClient = await this.container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ecrClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateRepositoryCommand) {
        return {
          repository: {
            registryId: capture.registryId,
            repositoryArn: capture.repositoryArn,
            repositoryName: capture.repositoryName,
            repositoryUri: capture.repositoryUri,
          },
        };
      }
    };
  }
}

@Factory<AddEcrImageResourceAction>(AddEcrImageResourceAction)
export class AddEcrImageResourceActionFactory {
  private static instance: AddEcrImageResourceAction;

  static async create(): Promise<AddEcrImageResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddEcrImageResourceAction(container);
    }
    return this.instance;
  }
}
