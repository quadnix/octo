import {
  AModule,
  type Account,
  type App,
  type Diff,
  type DiffMetadata,
  type IModelAction,
  Module,
} from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsS3StaticWebsiteServiceModuleSchema } from './index.schema.js';
import { AddS3StaticWebsiteModelAction } from './models/s3-static-website/actions/add-s3-static-website.model.action.js';
import { UpdateSourcePathsS3StaticWebsiteModelAction } from './models/s3-static-website/actions/update-source-paths-s3-static-website.model.action.js';
import { AwsS3StaticWebsiteService } from './models/s3-static-website/index.js';

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
 * } from '@quadnix/octo-aws-cdk/modules/service/s3-static-website-aws-service';
 *
 * octo.loadModule(AwsS3StaticWebsiteServiceModule, 'my-website-module', {
 *   bucketName: 'my-static-website',
 *   directoryPath: join(__dirname, 'website'),
 *   filter: (filePath) => !filePath.includes('.DS_Store'),
 *   region: myRegion,
 *   subDirectoryOrFilePath: 'public',
 *   transform: (filePath) => `public/${filePath}`,
 * });
 * ```
 *
 * @group Modules/Service/S3StaticWebsiteAwsService
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
  ): Promise<{ app: App; awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      app,
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
