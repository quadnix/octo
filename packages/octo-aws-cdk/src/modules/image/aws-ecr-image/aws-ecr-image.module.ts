import { ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import { AModule, type Account, type App, Container, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { FileUtility } from '../../../utilities/file/file.utility.js';
import { AwsEcrImageModuleSchema } from './index.schema.js';
import { AwsEcrImage } from './models/image/index.js';

/**
 * `AwsEcrImageModule` is an ECR-based AWS image module that provides an implementation for the `Image` model.
 * This module creates AWS ECR (Elastic Container Registry) repositories for storing and managing container images.
 * It provides functionality to manage Docker images across multiple AWS regions
 * and generate ECR authentication commands.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsEcrImageModule } from '@quadnix/octo-aws-cdk/modules/image/aws-ecr-image';
 *
 * octo.loadModule(AwsEcrImageModule, 'my-image-module', {
 *   imageFamily: 'quadnix',
 *   imageName: 'nginx',
 *   regions: [myRegion1, myRegion2]
 * });
 * ```
 *
 * @group Modules/Image/AwsEcrImage
 *
 * @reference Resources {@link EcrImageSchema}
 *
 * @see {@link AwsEcrImageModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Image} to learn more about the `Image` model.
 */
@Module<AwsEcrImageModule>('@octo', AwsEcrImageModuleSchema)
export class AwsEcrImageModule extends AModule<AwsEcrImageModuleSchema, AwsEcrImage> {
  async getEcrRepositoryCommands(
    imageFamily: string,
    imageName: string,
    imageTag: string,
    properties: { awsAccountId: string; awsRegionId: string; dockerExec?: string },
  ): Promise<{ login: string; push: string; tag: string }> {
    const container = Container.getInstance();
    const ecrClient = await container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    const image = `${imageFamily}/${imageName}:${imageTag}`;
    const dockerExec = properties.dockerExec || 'docker';

    const tokenResponse = await ecrClient.send(new GetAuthorizationTokenCommand({}));
    const token = FileUtility.base64Decode(tokenResponse.authorizationData![0].authorizationToken!);
    const proxyEndpoint = new URL(tokenResponse.authorizationData![0].proxyEndpoint!).host;

    const dockerLoginCommand = [
      'echo',
      token.split(':')[1], // Remove 'AWS:' from the beginning of token.
      '|',
      dockerExec,
      'login --username AWS --password-stdin',
      proxyEndpoint,
    ].join(' ');
    const dockerTagCommand = [dockerExec, 'tag', `${image}`, `${proxyEndpoint}/${image}`].join(' ');
    const dockerPushCommand = [dockerExec, 'push', `${proxyEndpoint}/${image}`].join(' ');

    return {
      login: dockerLoginCommand,
      push: dockerPushCommand,
      tag: dockerTagCommand,
    };
  }

  async onInit(inputs: AwsEcrImageModuleSchema): Promise<AwsEcrImage> {
    const { app } = await this.registerMetadata(inputs);

    // Create a new image.
    const image = new AwsEcrImage(inputs.imageFamily, inputs.imageName);
    app.addImage(image);

    return image;
  }

  override async registerMetadata(
    inputs: AwsEcrImageModuleSchema,
  ): Promise<{ app: App; uniqueImageRepositories: { awsAccountId: string; awsRegionId: string }[] }> {
    const metadata: Awaited<ReturnType<AwsEcrImageModule['registerMetadata']>> = {
      app: undefined as unknown as App,
      uniqueImageRepositories: [],
    };

    for (const region of inputs.regions) {
      const account = region.getParents()['account'][0].to as Account;
      if (!metadata.app) {
        metadata.app = account.getParents()['app'][0].to as App;
      }

      // Get AWS Region ID.
      const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

      if (
        !metadata.uniqueImageRepositories.find(
          (r) => r.awsAccountId === account.accountId && r.awsRegionId === awsRegionId,
        )
      ) {
        metadata.uniqueImageRepositories.push({
          awsAccountId: account.accountId,
          awsRegionId,
        });
      }
    }

    return metadata;
  }
}
