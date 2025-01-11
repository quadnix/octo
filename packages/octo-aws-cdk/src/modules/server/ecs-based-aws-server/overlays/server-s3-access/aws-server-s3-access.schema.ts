import { BaseOverlaySchema, Schema } from '@quadnix/octo';

export class AwsServerS3AccessSchema extends BaseOverlaySchema {
  override properties = Schema<{
    allowRead: boolean;
    allowWrite: boolean;
    bucketName: string;
    iamRoleName: string;
    iamRolePolicyId: string;
    remoteDirectoryPath: string;
  }>();
}
