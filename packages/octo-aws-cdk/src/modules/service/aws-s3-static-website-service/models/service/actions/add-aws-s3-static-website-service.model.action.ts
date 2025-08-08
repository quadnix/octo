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
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsS3StaticWebsiteService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  async handle(
    diff: Diff<AwsS3StaticWebsiteService>,
    actionInputs: EnhancedModuleSchema<AwsS3StaticWebsiteServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

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
@Factory<AddAwsS3StaticWebsiteServiceModelAction>(AddAwsS3StaticWebsiteServiceModelAction)
export class AddAwsS3StaticWebsiteServiceModelActionFactory {
  private static instance: AddAwsS3StaticWebsiteServiceModelAction;

  static async create(): Promise<AddAwsS3StaticWebsiteServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsS3StaticWebsiteServiceModelAction();
    }
    return this.instance;
  }
}
