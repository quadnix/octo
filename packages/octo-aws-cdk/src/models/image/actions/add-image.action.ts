import { CreateRepositoryCommand, DescribeImagesCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Diff, DiffAction, IAction, IActionInputRequest, IActionInputResponse, Image } from '@quadnix/octo';
import { parse } from 'path';
import { ProcessUtility } from '../../../utilities/process/process.utility';

export class AddImageAction implements IAction {
  readonly ACTION_NAME: string = 'addImageToECRAction';

  private readonly ecrClient: ECRClient;

  constructor(ecrClient: ECRClient) {
    this.ecrClient = ecrClient;
  }

  collectInput(diff: Diff): IActionInputRequest {
    const image = diff.model as Image;
    return [`image.${image.imageName}:${image.imageTag}.dockerExecutable`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  async handle(diff: Diff, actionInput: IActionInputResponse): Promise<void> {
    const { dockerOptions, imageName, imageTag } = diff.model as Image;

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
      const inputKeys = this.collectInput(diff);
      const dockerFileParts = parse(dockerOptions.dockerFilePath);
      const buildCommand = [actionInput[inputKeys[0]], 'build'];
      if (dockerOptions.quiet) {
        buildCommand.push('--quiet');
      }
      if (dockerOptions.buildArgs) {
        for (const key of Object.keys(dockerOptions.buildArgs)) {
          buildCommand.push(`--build-arg ${key}=${dockerOptions.buildArgs[key]}`);
        }
      }
      buildCommand.push(`-t ${imageName}:${imageTag}`);
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

      // Push image.
    }
  }

  async revert(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
