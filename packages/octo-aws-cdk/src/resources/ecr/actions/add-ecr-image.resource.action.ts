import {
  CreateRepositoryCommand,
  DescribeImagesCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { FileUtility } from '../../../utilities/file/file.utility.js';
import { ProcessUtility } from '../../../utilities/process/process.utility.js';
import { EcrImage } from '../ecr-image.resource.js';
import type { EcrImageSchema } from '../ecr-image.schema.js';

@Action(EcrImage)
export class AddEcrImageResourceAction implements IResourceAction<EcrImage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcrImage &&
      (diff.node.constructor as typeof EcrImage).NODE_NAME === 'ecr-image'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.node as EcrImage;
    const properties = ecrImage.properties;
    const response = ecrImage.response;

    // Get instances.
    const ecrClient = await this.container.get(ECRClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    const image = `${properties.imageName}:${properties.imageTag}`;
    const dockerExec = properties.dockerExec;
    const dockerfileDirectory = properties.dockerfileDirectory;

    try {
      // Try and fetch image.
      const data = await ecrClient.send(
        new DescribeImagesCommand({
          imageIds: [
            {
              imageTag: properties.imageTag,
            },
          ],
          repositoryName: properties.imageName,
        }),
      );

      // If image already exists in this region, do nothing.
      if (data.imageDetails?.length) {
        const repositoryData = await ecrClient.send(
          new DescribeRepositoriesCommand({
            repositoryNames: [properties.imageName],
          }),
        );

        // Set response.
        response.awsRegionId = properties.awsRegionId;
        response.registryId = data.imageDetails[0].registryId!;
        response.repositoryArn = repositoryData.repositories![0].repositoryArn!;
        response.repositoryName = data.imageDetails[0].repositoryName!;
        response.repositoryUri = repositoryData.repositories![0].repositoryUri!;
      }
    } catch (describeImagesError) {
      if (describeImagesError.name === 'RepositoryNotFoundException') {
        // Create a new repository.
        const data = await ecrClient.send(
          new CreateRepositoryCommand({
            imageScanningConfiguration: {
              scanOnPush: false,
            },
            imageTagMutability: 'IMMUTABLE',
            repositoryName: properties.imageName,
          }),
        );

        // Set response.
        response.awsRegionId = properties.awsRegionId;
        response.registryId = data.repository!.registryId!;
        response.repositoryArn = data.repository!.repositoryArn!;
        response.repositoryName = data.repository!.repositoryName!;
        response.repositoryUri = data.repository!.repositoryUri!;
      } else if (describeImagesError.name === 'ImageNotFoundException') {
        // Intentionally left blank.
      } else {
        throw describeImagesError;
      }

      // Get authorization token to push image.
      const tokenResponse = await ecrClient.send(new GetAuthorizationTokenCommand({}));
      const token = FileUtility.base64Decode(tokenResponse.authorizationData![0].authorizationToken!);
      const proxyEndpoint = new URL(tokenResponse.authorizationData![0].proxyEndpoint!).host;

      // Build command for docker login.
      const dockerLoginCommand = [
        'echo',
        token.split(':')[1], // Remove 'AWS:' from the beginning of token.
        '|',
        dockerExec,
        'login --username AWS --password-stdin',
        proxyEndpoint,
      ].join(' ');
      // Build command for docker tag.
      const dockerTagCommand = [dockerExec, 'tag', `${image}`, `${proxyEndpoint}/${image}`].join(' ');
      // Build command for docker push.
      const dockerPushCommand = [dockerExec, 'push', `${proxyEndpoint}/${image}`].join(' ');

      // Push image.
      const pushRunner = ProcessUtility.runDetachedProcess(
        `${dockerLoginCommand} && ${dockerTagCommand} && ${dockerPushCommand}`,
        { cwd: dockerfileDirectory, shell: true },
        'pipe',
      );
      await new Promise<void>((resolve, reject) => {
        pushRunner.on('error', (error) => {
          pushRunner.removeAllListeners();

          pushRunner.kill();
          reject(error);
        });
        pushRunner.on('exit', (code) => {
          pushRunner.removeAllListeners();

          if (code !== 0) {
            reject(new Error(`Push failed with exit code: ${code}`));
          } else {
            resolve();
          }
        });
      });
    }
  }

  async mock(diff: Diff, capture: Partial<EcrImageSchema['response']>): Promise<void> {
    // Get properties.
    const ecrImage = diff.node as EcrImage;
    const properties = ecrImage.properties;

    const ecrClient = await this.container.get(ECRClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ecrClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DescribeImagesCommand) {
        return { imageDetails: [{ registryId: capture.registryId, repositoryName: capture.repositoryName }] };
      } else if (instance instanceof DescribeRepositoriesCommand) {
        return { repositories: [{ repositoryArn: capture.repositoryArn, repositoryUri: capture.repositoryUri }] };
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
