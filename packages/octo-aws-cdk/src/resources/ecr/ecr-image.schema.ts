import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcrImageSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
    imageName: string;
  }>();

  override response = Schema<{
    registryId: string;
    repositoryArn: string;
    repositoryName: string;
    repositoryUri: string;
  }>();
}
