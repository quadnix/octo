import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { S3WebsiteSchema } from '../index.schema.js';
import { S3Website } from '../s3-website.resource.js';

/**
 * @internal
 */
@Action(S3Website)
export class CaptureS3WebsiteResponseResourceAction implements IResourceAction<S3Website> {
  filter(diff: Diff): boolean {
    return diff.node instanceof S3Website && hasNodeName(diff.node, 's3-website');
  }

  async handle(_diff: Diff<S3Website>): Promise<void> {}

  async mock(
    diff: Diff<S3Website>,
    capture: Partial<S3WebsiteSchema['response']>,
  ): Promise<S3WebsiteSchema['response']> {
    const s3Website = diff.node;
    const properties = s3Website.properties;

    return {
      Arn: capture.Arn,
      awsRegionId: properties.awsRegionId,
    };
  }
}

@Factory<CaptureS3WebsiteResponseResourceAction>(CaptureS3WebsiteResponseResourceAction)
export class CaptureS3WebsiteResponseResourceActionFactory {
  private static instance: CaptureS3WebsiteResponseResourceAction;

  static async create(): Promise<CaptureS3WebsiteResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureS3WebsiteResponseResourceAction();
    }
    return this.instance;
  }
}
