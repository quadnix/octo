import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EfsMountTargetSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
  }>();

  override response = Schema<{
    MountTargetId: string;
    NetworkInterfaceId: string;
  }>();
}
