import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { S3Website } from '../../../../../../resources/s3-website/index.js';
import type { AwsS3StaticWebsiteServiceModule } from '../../../aws-s3-static-website.service.module.js';
import { AwsS3StaticWebsiteService } from '../aws-s3-static-website.service.model.js';

/**
 * @internal
 */
@Action(AwsS3StaticWebsiteService)
export class AddS3StaticWebsiteModelAction implements IModelAction<AwsS3StaticWebsiteServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsS3StaticWebsiteService &&
      (diff.node.constructor as typeof AwsS3StaticWebsiteService).NODE_NAME === 'service' &&
      diff.field === 'serviceId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsS3StaticWebsiteServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node as AwsS3StaticWebsiteService;

    const { awsAccountId, awsRegionId } = actionInputs.metadata as Awaited<
      ReturnType<AwsS3StaticWebsiteServiceModule['registerMetadata']>
    >;

    // Create S3 Website.
    const s3Website = new S3Website(`bucket-${bucketName}`, {
      awsAccountId,
      awsRegionId,
      Bucket: bucketName,
      ErrorDocument: 'error.html',
      IndexDocument: 'index.html',
    });

    actionOutputs[s3Website.resourceId] = s3Website;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddS3StaticWebsiteModelAction>(AddS3StaticWebsiteModelAction)
export class AddS3StaticWebsiteModelActionFactory {
  private static instance: AddS3StaticWebsiteModelAction;

  static async create(): Promise<AddS3StaticWebsiteModelAction> {
    if (!this.instance) {
      this.instance = new AddS3StaticWebsiteModelAction();
    }
    return this.instance;
  }
}
