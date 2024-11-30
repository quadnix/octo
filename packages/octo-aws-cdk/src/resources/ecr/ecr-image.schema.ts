import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcrImageSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
    dockerExec: string;
    dockerfileDirectory: string;
    imageName: string;
    imageTag: string;
  }>();

  override response = Schema<{
    awsRegionId: string;
    registryId: string;
    repositoryArn: string;
    repositoryName: string;
    repositoryUri: string;
  }>();
}
