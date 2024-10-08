import { type App, type Diff, type DiffMetadata, type IModelAction, type IModule, Module } from '@quadnix/octo';
import { AddS3StaticWebsiteModelAction } from '../models/service/s3-static-website/actions/add-s3-static-website.model.action.js';
import { UpdateSourcePathsS3StaticWebsiteModelAction } from '../models/service/s3-static-website/actions/update-source-paths-s3-static-website.model.action.js';
import type { S3StaticWebsiteService } from '../models/service/s3-static-website/s3-static-website.service.model.js';

@Module({
  preCommitHooks: [
    {
      callback: async (app: App, modelTransaction: DiffMetadata[][]): Promise<void> => {
        let shouldSaveS3WebsiteSourceManifest: false | Diff = false;

        loop1: for (const diffsProcessedInSameLevel of modelTransaction) {
          for (const d of diffsProcessedInSameLevel) {
            for (const a of d.actions as IModelAction[]) {
              if (
                a instanceof AddS3StaticWebsiteModelAction ||
                a instanceof UpdateSourcePathsS3StaticWebsiteModelAction
              ) {
                shouldSaveS3WebsiteSourceManifest = d.diff;
                break loop1;
              }
            }
          }
        }

        if (shouldSaveS3WebsiteSourceManifest) {
          const model = shouldSaveS3WebsiteSourceManifest.node as S3StaticWebsiteService;
          await model.saveSourceManifest();
        }
      },
    },
  ],
})
export class S3WebsiteSaveManifestModule implements IModule<void> {
  async onInit(): Promise<void> {}
}
