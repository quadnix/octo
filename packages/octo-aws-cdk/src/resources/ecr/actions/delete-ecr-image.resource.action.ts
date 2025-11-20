import { DeleteRepositoryCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { EcrImage } from '../ecr-image.resource.js';
import type { EcrImageSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcrImage)
export class DeleteEcrImageResourceAction implements IResourceAction<EcrImage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcrImage &&
      hasNodeName(diff.node, 'ecr-image') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<EcrImage>): Promise<EcrImageSchema['response']> {
    // Get properties.
    const ecrImage = diff.node;
    const properties = ecrImage.properties;
    const response = ecrImage.response;

    // Get instances.
    const ecrClient = await this.container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    await ecrClient.send(
      new DeleteRepositoryCommand({
        force: true,
        repositoryName: properties.imageId,
      }),
    );

    return response;
  }

  async mock(diff: Diff<EcrImage>): Promise<EcrImageSchema['response']> {
    const ecrImage = diff.node;
    return ecrImage.response;
  }
}

/**
 * @internal
 */
@Factory<DeleteEcrImageResourceAction>(DeleteEcrImageResourceAction)
export class DeleteEcrImageResourceActionFactory {
  private static instance: DeleteEcrImageResourceAction;

  static async create(): Promise<DeleteEcrImageResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteEcrImageResourceAction(container);
    }
    return this.instance;
  }
}
