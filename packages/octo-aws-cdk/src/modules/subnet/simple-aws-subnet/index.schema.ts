import {
  type Filesystem,
  FilesystemSchema,
  type Region,
  RegionSchema,
  Schema,
  SubnetType,
  Validate,
} from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';

export { SubnetLocalFilesystemMountAnchorSchema } from '../../../anchors/subnet-local-filesystem-mount/subnet-local-filesystem-mount.anchor.schema.js';
export { AwsSubnetSchema } from './models/subnet/aws.subnet.schema.js';
export { AwsSubnetLocalFilesystemMountSchema } from './overlays/subnet-local-filesystem-mount/aws-subnet-local-filesystem-mount.schema.js';
export { EfsMountTargetSchema } from '../../../resources/efs-mount-target/index.schema.js';
export { NetworkAclSchema } from '../../../resources/network-acl/index.schema.js';
export { RouteTableSchema } from '../../../resources/route-table/index.schema.js';
export { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';
export { SubnetSchema } from '../../../resources/subnet/index.schema.js';

export class AwsSubnetModuleSchema {
  @Validate({
    destruct: (value: AwsSubnetModuleSchema['localFilesystems']): Filesystem[] => value!,
    options: {
      isModel: { anchors: [EfsFilesystemAnchorSchema], NODE_NAME: 'filesystem' },
      isSchema: { schema: FilesystemSchema },
    },
  })
  localFilesystems? = Schema<Filesystem[]>([]);

  @Validate({
    options: {
      isModel: { anchors: [AwsRegionAnchorSchema], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  @Validate({ options: { minLength: 1 } })
  subnetAvailabilityZone = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  subnetCidrBlock = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  subnetName = Schema<string>();

  @Validate({
    destruct: (value: AwsSubnetModuleSchema['subnetOptions']): string[] => [
      String(value!.createNatGateway),
      String(value!.disableSubnetIntraNetwork),
      value!.subnetType,
    ],
    options: { minLength: 1 },
  })
  subnetOptions? = Schema<{ createNatGateway: boolean; disableSubnetIntraNetwork: boolean; subnetType: SubnetType }>({
    createNatGateway: false,
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PRIVATE,
  });

  @Validate({
    destruct: (value: AwsSubnetModuleSchema['subnetSiblings']): string[] =>
      value!.map((v) => [String(v.attachToNatGateway), v.subnetCidrBlock, v.subnetName]).flat(),
    options: { minLength: 1 },
  })
  subnetSiblings? = Schema<{ attachToNatGateway: boolean; subnetCidrBlock: string; subnetName: string }[]>([]);
}
