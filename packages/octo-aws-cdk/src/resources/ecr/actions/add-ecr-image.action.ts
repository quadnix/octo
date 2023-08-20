import {
  CreateRepositoryCommand,
  DescribeImagesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { FileUtility } from '../../../utilities/file/file.utility';
import { ProcessUtility } from '../../../utilities/process/process.utility';
import { IEcrImageProperties } from '../ecr-image.interface';
import { EcrImage } from '../ecr-image.resource';

export class AddEcrImageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcrImageAction';

  constructor(private readonly ecrClient: ECRClient) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'ecr-image';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.model as EcrImage;
    const properties = ecrImage.properties as unknown as IEcrImageProperties;

    const image = `${properties.imageName}:${properties.imageTag}`;

    // Create a new repository.
    try {
      const data = await this.ecrClient.send(
        new DescribeImagesCommand({
          imageIds: [
            {
              imageTag: properties.imageTag,
            },
          ],
          repositoryName: properties.imageName,
        }),
      );

      if (data.imageDetails?.length) {
        const error = new Error('Image already exists!');
        error.name = 'ImageAlreadyExistsError';
        throw error;
      }
    } catch (describeImagesError) {
      if (describeImagesError.name === 'RepositoryNotFoundException') {
        await this.ecrClient.send(
          new CreateRepositoryCommand({
            imageScanningConfiguration: {
              scanOnPush: false,
            },
            imageTagMutability: 'IMMUTABLE',
            repositoryName: properties.imageName,
          }),
        );
      } else if (describeImagesError.name === 'ImageNotFoundException') {
        // Intentionally left blank.
      } else {
        throw describeImagesError;
      }

      // Build image.
      const buildRunner = ProcessUtility.runDetachedProcess(
        properties.buildCommand,
        { cwd: properties.dockerFileDirectory, shell: true },
        'pipe',
      );
      await new Promise<void>((resolve, reject) => {
        buildRunner.on('error', (error) => {
          buildRunner.removeAllListeners();

          buildRunner.kill();
          reject(error);
        });
        buildRunner.on('exit', (code) => {
          buildRunner.removeAllListeners();

          if (code !== 0) {
            reject(new Error(`Build failed with exit code: ${code}`));
          } else {
            resolve();
          }
        });
      });

      // Get authorization token to push image.
      const tokenResponse = await this.ecrClient.send(new GetAuthorizationTokenCommand({}));
      const token = FileUtility.base64Decode(tokenResponse.authorizationData![0].authorizationToken as string);
      const proxyEndpoint = new URL(tokenResponse.authorizationData![0].proxyEndpoint as string).host;

      // Build command for docker login.
      const dockerLoginCommand = [
        'echo',
        token.split(':')[1], // Remove 'AWS:' from the beginning of token.
        '|',
        properties.dockerExec,
        'login --username AWS --password-stdin',
        proxyEndpoint,
      ].join(' ');
      // Build command for docker tag.
      const dockerTagCommand = [properties.dockerExec, 'tag', `${image}`, `${proxyEndpoint}/${image}`].join(' ');
      // Build command for docker push.
      const dockerPushCommand = [properties.dockerExec, 'push', `${proxyEndpoint}/${image}`].join(' ');

      // Push image.
      const pushRunner = ProcessUtility.runDetachedProcess(
        `${dockerLoginCommand} && ${dockerTagCommand} && ${dockerPushCommand}`,
        { cwd: properties.dockerFileDirectory, shell: true },
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
