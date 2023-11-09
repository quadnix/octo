import {
  CreateRepositoryCommand,
  DescribeImagesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { FileUtility } from '../../../utilities/file/file.utility.js';
import { ProcessUtility } from '../../../utilities/process/process.utility.js';
import { IEcrImageProperties, IEcrImageReplicationMetadata, IEcrImageResponse } from '../ecr-image.interface.js';
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

    const ecrImageReplicationMetadata: IEcrImageReplicationMetadata =
      (response?.replicationsStringified as string)?.length > 0
        ? JSON.parse(response.replicationsStringified as string)
        : {};
    const replicationRegions = ecrImageReplicationMetadata.regions || [];

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
        replicationRegions.push({
          awsRegionId: properties.awsRegionId,
          registryId: data.imageDetails[0].registryId as string,
          repositoryName: data.imageDetails[0].repositoryName as string,
        });
        response.replicationsStringified = JSON.stringify({
          regions: replicationRegions,
        } as IEcrImageReplicationMetadata);
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
        replicationRegions.push({
          awsRegionId: properties.awsRegionId,
          registryId: data.repository!.registryId as string,
          repositoryArn: data.repository!.repositoryArn as string,
          repositoryName: data.repository!.repositoryName as string,
          repositoryUri: data.repository!.repositoryUri as string,
        });
        response.replicationsStringified = JSON.stringify({
          regions: replicationRegions,
        } as IEcrImageReplicationMetadata);
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
      const tokenResponse = await ecrClient.send(new GetAuthorizationTokenCommand({}));
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

@Factory<AddEcrImageAction>(AddEcrImageAction)
export class AddEcrImageActionFactory {
  static async create(): Promise<AddEcrImageAction> {
    return new AddEcrImageAction();
  }
}
