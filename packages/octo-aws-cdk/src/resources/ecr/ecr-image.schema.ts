import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcrImageSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    imageId: string;
  }>();

  override response = Schema<{
    registryId: string;
    repositoryArn: string;
    repositoryName: string;
    repositoryUri: string;
  }>();
}
