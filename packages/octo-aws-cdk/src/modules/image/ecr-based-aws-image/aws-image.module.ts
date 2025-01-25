import { ECRClient } from '@aws-sdk/client-ecr';
import {
  AModule,
  type Account,
  type App,
  Container,
  ContainerRegistrationError,
  Module,
  type Region,
  Schema,
} from '@quadnix/octo';
import { type AwsCredentialIdentityProvider } from '@smithy/types';
import { VpcSchema } from '../../../resources/vpc/index.js';
import { AwsImage } from './models/image/index.js';

export class AwsImageModuleSchema {
  imageFamily = Schema<string>();

  imageName = Schema<string>();

  regions = Schema<Region[]>();
}

@Module<AwsImageModule>('@octo', AwsImageModuleSchema)
export class AwsImageModule extends AModule<AwsImageModuleSchema, AwsImage> {
  async onInit(inputs: AwsImageModuleSchema): Promise<AwsImage> {
    const regions = inputs.regions;
    const account = regions[0].getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;
    const { uniqueImageRepositories } = await this.registerMetadata(inputs);

    // Create a new image.
    const image = new AwsImage(inputs.imageFamily, inputs.imageName);
    app.addImage(image);

    for (const { account, awsAccountId, awsRegionId } of uniqueImageRepositories) {
      // Create and register a new EFSClient.
      const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
      const ecrClient = new ECRClient({ ...credentials, region: awsRegionId });
      const container = Container.getInstance();
      try {
        container.registerValue(ECRClient, ecrClient, {
          metadata: { awsAccountId, awsRegionId, package: '@octo' },
        });
      } catch (error) {
        if (!(error instanceof ContainerRegistrationError)) {
          throw error;
        }
      }
    }

    return image;
  }

  override async registerMetadata(
    inputs: AwsImageModuleSchema,
  ): Promise<{ uniqueImageRepositories: { account: Account; awsAccountId: string; awsRegionId: string }[] }> {
    const metadata: Awaited<ReturnType<AwsImageModule['registerMetadata']>> = { uniqueImageRepositories: [] };

    for (const region of inputs.regions) {
      const account = region.getParents()['account'][0].to as Account;

      // Get AWS Region ID.
      const [matchingVpc] = await region.getResourcesMatchingSchema(VpcSchema);
      const awsRegionId = matchingVpc.getSchemaInstance().properties.awsRegionId;

      if (
        !metadata.uniqueImageRepositories.find(
          (r) => r.awsAccountId === account.accountId && r.awsRegionId === awsRegionId,
        )
      ) {
        metadata.uniqueImageRepositories.push({
          account,
          awsAccountId: account.accountId,
          awsRegionId,
        });
      }
    }

    return metadata;
  }
}
