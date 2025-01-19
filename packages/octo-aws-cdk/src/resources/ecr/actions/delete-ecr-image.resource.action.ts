import { DeleteRepositoryCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EcrImage } from '../ecr-image.resource.js';

@Action(EcrImage)
export class DeleteEcrImageResourceAction implements IResourceAction<EcrImage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcrImage &&
      (diff.node.constructor as typeof EcrImage).NODE_NAME === 'ecr-image' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.node as EcrImage;
    const properties = ecrImage.properties;

    // Get instances.
    const ecrClient = await this.container.get(ECRClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    await ecrClient.send(
      new DeleteRepositoryCommand({
        force: true,
        repositoryName: properties.imageName,
      }),
    );
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.node as EcrImage;
    const properties = ecrImage.properties;

    const ecrClient = await this.container.get(ECRClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ecrClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteRepositoryCommand) {
        return;
      }
    };
  }
}

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
