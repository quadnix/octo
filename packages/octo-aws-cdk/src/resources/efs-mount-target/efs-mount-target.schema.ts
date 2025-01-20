import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

export class EfsMountTargetSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
  }>();

  override response = Schema<{
    MountTargetId: string;
    NetworkInterfaceId: string;
  }>();
}

export class EfsMountTargetEfsSchema extends BaseResourceSchema {
  override response = Schema<{
    FileSystemId: string;
  }>();
}
export type EfsMountTargetEfs = AResource<EfsMountTargetEfsSchema, any>;

export class EfsMountTargetSubnetSchema extends BaseResourceSchema {
  override response = Schema<{
    SubnetId: string;
  }>();
}
export type EfsMountTargetSubnet = AResource<EfsMountTargetSubnetSchema, any>;
