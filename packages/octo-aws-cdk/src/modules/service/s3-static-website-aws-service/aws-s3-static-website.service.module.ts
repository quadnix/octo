import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  AModule,
  type Account,
  type App,
  BaseResourceSchema,
  Container,
  ContainerRegistrationError,
  type Diff,
  type DiffMetadata,
  type IModelAction,
  Module,
  type Region,
  Schema,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AddS3StaticWebsiteModelAction } from './models/s3-static-website/actions/add-s3-static-website.model.action.js';
import { UpdateSourcePathsS3StaticWebsiteModelAction } from './models/s3-static-website/actions/update-source-paths-s3-static-website.model.action.js';
import { AwsS3StaticWebsiteService } from './models/s3-static-website/index.js';

class AwsResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.awsRegionId], options: { minLength: 1 } })
  override properties = Schema<{
    awsRegionId: string;
  }>();
}

export class AwsS3StaticWebsiteServiceModuleSchema {
  bucketName = Schema<string>();

  directoryPath = Schema<string>();

  filter? = Schema<((filePath: string) => boolean) | null>(null);

  region = Schema<Region>();

  subDirectoryOrFilePath? = Schema<string | null>(null);

  transform? = Schema<((filePath: string) => string) | null>(null);
}

@Module<AwsS3StaticWebsiteServiceModule>('@octo', AwsS3StaticWebsiteServiceModuleSchema)
export class AwsS3StaticWebsiteServiceModule extends AModule<
  AwsS3StaticWebsiteServiceModuleSchema,
  AwsS3StaticWebsiteService
> {
  async onInit(inputs: AwsS3StaticWebsiteServiceModuleSchema): Promise<AwsS3StaticWebsiteService> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;
    const { awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new s3-website service.
    const s3StaticWebsiteService = new AwsS3StaticWebsiteService(inputs.bucketName);
    app.addService(s3StaticWebsiteService);

    // Add website source.
    await s3StaticWebsiteService.addSource(
      inputs.directoryPath,
      inputs.subDirectoryOrFilePath || undefined,
      inputs.filter || undefined,
      inputs.transform || undefined,
    );

    // Create and register a new S3Client.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const s3Client = new S3Client({ ...credentials });
    const container = Container.getInstance();
    try {
      container.registerValue(S3Client, s3Client, {
        metadata: { awsAccountId, awsRegionId, package: '@octo' },
      });
      container.registerValue('Upload', Upload, {
        metadata: { package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return s3StaticWebsiteService;
  }

  override registerHooks(): {
    preCommitHooks?: {
      handle: (app: App, modelTransaction: DiffMetadata[][]) => Promise<void>;
    }[];
  } {
    return {
      preCommitHooks: [
        {
          handle: async (_app: App, modelTransaction: DiffMetadata[][]): Promise<void> => {
            let shouldSaveS3WebsiteSourceManifest: false | Diff = false;

            loop1: for (const diffsProcessedInSameLevel of modelTransaction) {
              for (const d of diffsProcessedInSameLevel) {
                for (const a of d.actions as IModelAction<any>[]) {
                  if (
                    [AddS3StaticWebsiteModelAction.name, UpdateSourcePathsS3StaticWebsiteModelAction.name].includes(
                      a.constructor.name,
                    )
                  ) {
                    shouldSaveS3WebsiteSourceManifest = d.diff;
                    break loop1;
                  }
                }
              }
            }

            if (shouldSaveS3WebsiteSourceManifest) {
              const model = shouldSaveS3WebsiteSourceManifest.node as AwsS3StaticWebsiteService;
              await model.saveSourceManifest();
            }
          },
        },
      ],
    };
  }

  override async registerMetadata(
    inputs: AwsS3StaticWebsiteServiceModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [[resourceSynth]] = await region.getResourcesMatchingSchema(AwsResourceSchema);
    const awsRegionId = resourceSynth.properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
