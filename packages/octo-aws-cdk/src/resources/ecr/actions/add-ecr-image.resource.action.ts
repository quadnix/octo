import { CreateRepositoryCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { EcrImage } from '../ecr-image.resource.js';
import type { EcrImageSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcrImage)
export class AddEcrImageResourceAction implements IResourceAction<EcrImage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcrImage &&
      hasNodeName(diff.node, 'ecr-image') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcrImage>): Promise<EcrImageSchema['response']> {
    // Get properties.
    const ecrImage = diff.node;
    const properties = ecrImage.properties;
    const tags = ecrImage.tags;

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
        tags:
          Object.keys(tags).length > 0
            ? Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
            : undefined,
      }),
    );

    return {
      registryId: data.repository!.registryId!,
      repositoryArn: data.repository!.repositoryArn!,
      repositoryName: data.repository!.repositoryName!,
      repositoryUri: data.repository!.repositoryUri!,
    };
  }

  async mock(_diff: Diff<EcrImage>, capture: Partial<EcrImageSchema['response']>): Promise<EcrImageSchema['response']> {
    return {
      registryId: capture.registryId!,
      repositoryArn: capture.repositoryArn!,
      repositoryName: capture.repositoryName!,
      repositoryUri: capture.repositoryUri!,
    };
  }
}

/**
 * @internal
 */
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
