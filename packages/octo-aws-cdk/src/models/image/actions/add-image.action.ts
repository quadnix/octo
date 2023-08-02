import {
  BatchDeleteImageCommand,
  CreateRepositoryCommand,
  DescribeImagesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr';
import { Diff, DiffAction, IAction, IActionInputRequest, IActionInputResponse, Image } from '@quadnix/octo';
import { parse } from 'path';
import { FileUtility } from '../../../utilities/file/file.utility';
import { ProcessUtility } from '../../../utilities/process/process.utility';

export class AddImageAction implements IAction {
  readonly ACTION_NAME: string = 'addImageToECRAction';

  constructor(private readonly ecrClient: ECRClient) {}

  collectInput(diff: Diff): IActionInputRequest {
    const image = diff.model as Image;
    return [`image.${image.imageName}:${image.imageTag}.dockerExecutable`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  async handle(diff: Diff, actionInput: IActionInputResponse): Promise<void> {
    const { dockerOptions, imageName, imageTag } = diff.model as Image;
    const dockerExec = actionInput[this.collectInput(diff)[0]];
    const image = `${imageName}:${imageTag}`;

    // Create a new repository.
    try {
      const data = await this.ecrClient.send(
        new DescribeImagesCommand({
          imageIds: [
            {
              imageTag,
            },
          ],
          repositoryName: imageName,
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
            repositoryName: imageName,
          }),
        );
      } else if (describeImagesError.name === 'ImageNotFoundException') {
        // Intentionally left blank.
      } else {
        throw describeImagesError;
      }

      // Build command to build image.
      const dockerFileParts = parse(dockerOptions.dockerFilePath);
      const buildCommand = [dockerExec, 'build'];
      if (dockerOptions.quiet) {
        buildCommand.push('--quiet');
      }
      if (dockerOptions.buildArgs) {
        for (const key of Object.keys(dockerOptions.buildArgs)) {
          buildCommand.push(`--build-arg ${key}=${dockerOptions.buildArgs[key]}`);
        }
      }
      buildCommand.push(`-t ${image}`);
      buildCommand.push(`-f ${dockerFileParts.base}`);
      buildCommand.push('.');

      // Build image.
      const buildRunner = ProcessUtility.runDetachedProcess(
        buildCommand.join(' '),
        { cwd: dockerFileParts.dir, shell: true },
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
        { cwd: dockerFileParts.dir, shell: true },
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

  async revert(diff: Diff): Promise<void> {
    const { imageName, imageTag } = diff.model as Image;

    await this.ecrClient.send(
      new BatchDeleteImageCommand({
        imageIds: [
          {
            imageTag,
          },
        ],
        repositoryName: imageName,
      }),
    );
  }
}
