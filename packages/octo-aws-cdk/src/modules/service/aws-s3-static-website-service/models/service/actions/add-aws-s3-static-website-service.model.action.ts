import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import { S3Website } from '../../../../../../resources/s3-website/index.js';
import type { AwsS3StaticWebsiteServiceModule } from '../../../aws-s3-static-website-service.module.js';
import { AwsS3StaticWebsiteService } from '../aws-s3-static-website-service.model.js';

/**
 * @internal
 */
@Action(AwsS3StaticWebsiteService)
export class AddAwsS3StaticWebsiteServiceModelAction implements IModelAction<AwsS3StaticWebsiteServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsS3StaticWebsiteService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsS3StaticWebsiteService>,
    actionInputs: EnhancedModuleSchema<AwsS3StaticWebsiteServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const errorDocument = 'error.html';
    const indexDocument = 'index.html';
    const sanitizedBucketName = bucketName.replace(/[^\w-]/g, '-');

    // Create S3 Website.
    const s3Website = new S3Website(`bucket-${sanitizedBucketName}`, {
      awsAccountId,
      awsRegionId,
      Bucket: bucketName,
      ErrorDocument: errorDocument,
      IndexDocument: indexDocument,
    });

    actionOutputs[s3Website.resourceId] = s3Website;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsS3StaticWebsiteServiceModelAction>(AddAwsS3StaticWebsiteServiceModelAction)
export class AddAwsS3StaticWebsiteServiceModelActionFactory {
  private static instance: AddAwsS3StaticWebsiteServiceModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsS3StaticWebsiteServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsS3StaticWebsiteServiceModelAction();
    }
    return this.instance;
  }
}
