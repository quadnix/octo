import { AModule, type App, type Diff, type DiffMetadata, type IModelAction, Module } from '@quadnix/octo';
import { AwsS3StaticWebsiteServiceModuleSchema } from './index.schema.js';
import { AddAwsS3StaticWebsiteServiceModelAction } from './models/service/actions/add-aws-s3-static-website-service.model.action.js';
import { UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction } from './models/service/actions/update-aws-s3-static-website-service-source-paths.model.action.js';
import { AwsS3StaticWebsiteService } from './models/service/index.js';

/**
 * `AwsS3StaticWebsiteServiceModule` is an S3-based AWS static website service module
 * that provides an implementation for the `Service` model.
 * This module creates S3 buckets configured for static website hosting with support for local file synchronization,
 * filtering, and transformation capabilities.
 * It manages the deployment of static websites from local directories to S3.
 *
 * @example
 * TypeScript
 * ```ts
 * import {
 *   AwsS3StaticWebsiteServiceModule
 * } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';
 *
 * octo.loadModule(AwsS3StaticWebsiteServiceModule, 'my-website-module', {
 *   bucketName: 'my-static-website',
 *   directoryPath: join(__dirname, 'website'),
 *   filter: (filePath) => !filePath.includes('.DS_Store'),
 *   region: 'us-east-1',
 *   subDirectoryOrFilePath: 'public',
 *   transform: (filePath) => `public/${filePath}`,
 * });
 * ```
 *
 * @group Modules/Service/AwsS3StaticWebsiteService
 *
 * @reference Resources {@link S3WebsiteSchema}
 *
 * @see {@link AwsS3StaticWebsiteServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Service} to learn more about the `Service` model.
 */
@Module<AwsS3StaticWebsiteServiceModule>('@octo', AwsS3StaticWebsiteServiceModuleSchema)
export class AwsS3StaticWebsiteServiceModule extends AModule<
  AwsS3StaticWebsiteServiceModuleSchema,
  AwsS3StaticWebsiteService
> {
  async onInit(inputs: AwsS3StaticWebsiteServiceModuleSchema): Promise<AwsS3StaticWebsiteService> {
    const { app } = await this.registerMetadata(inputs);

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
                    [
                      AddAwsS3StaticWebsiteServiceModelAction.name,
                      UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction.name,
                    ].includes(a.constructor.name)
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
  ): Promise<{ app: App; awsAccountId: string; awsRegionId: string }> {
    const account = inputs.account;
    const app = account.getParents()['app'][0].to as App;

    return {
      app,
      awsAccountId: account.accountId,
      awsRegionId: inputs.awsRegionId,
    };
  }
}
