import {
  CreateRepositoryCommand,
  DescribeImagesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { FileUtility } from '../../../utilities/file/file.utility.js';
import { ProcessUtility } from '../../../utilities/process/process.utility.js';
import { IEcrImageProperties, IEcrImageResponse } from '../ecr-image.interface.js';
import { EcrImage } from '../ecr-image.resource.js';

@Action(ModelType.RESOURCE)
export class AddEcrImageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcrImageAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'ecr-image';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.model as EcrImage;
    const properties = ecrImage.properties as unknown as IEcrImageProperties;
    const response = ecrImage.response as unknown as IEcrImageResponse;

    // Get instances.
    const ecrClient = await Container.get(ECRClient, { args: [properties.awsRegionId] });

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
        // Set response.
        response.awsRegionId = properties.awsRegionId;
        response.registryId = data.imageDetails[0].registryId as string;
        response.repositoryName = data.imageDetails[0].repositoryName as string;
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
        response.registryId = data.repository!.registryId as string;
        response.repositoryArn = data.repository!.repositoryArn as string;
        response.repositoryName = data.repository!.repositoryName as string;
        response.repositoryUri = data.repository!.repositoryUri as string;
      } else if (describeImagesError.name === 'ImageNotFoundException') {
        // Intentionally left blank.
      } else {
        throw describeImagesError;
      }

      // Get authorization token to push image.
      const tokenResponse = await ecrClient.send(new GetAuthorizationTokenCommand({}));
      const token = FileUtility.base64Decode(tokenResponse.authorizationData![0].authorizationToken as string);
      const proxyEndpoint = new URL(tokenResponse.authorizationData![0].proxyEndpoint as string).host;

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
}

@Factory<AddEcrImageAction>(AddEcrImageAction)
export class AddEcrImageActionFactory {
  static async create(): Promise<AddEcrImageAction> {
    return new AddEcrImageAction();
  }
}
