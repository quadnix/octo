import { AModule, type Account, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EfsFilesystemAnchor } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.js';
import { AwsFilesystemModuleSchema } from './index.schema.js';
import { AwsFilesystem } from './models/filesystem/index.js';

@Module<AwsFilesystemModule>('@octo', AwsFilesystemModuleSchema)
export class AwsFilesystemModule extends AModule<AwsFilesystemModuleSchema, AwsFilesystem> {
  async onInit(inputs: AwsFilesystemModuleSchema): Promise<AwsFilesystem> {
    const region = inputs.region;

    // Create a new filesystem.
    const filesystem = new AwsFilesystem(inputs.filesystemName);
    region.addFilesystem(filesystem);

    // Add anchors.
    const efsFilesystemAnchor = new EfsFilesystemAnchor(
      'EfsFilesystemAnchor',
      { filesystemName: inputs.filesystemName },
      filesystem,
    );
    filesystem.addAnchor(efsFilesystemAnchor);

    return filesystem;
  }

  override async registerMetadata(
    inputs: AwsFilesystemModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
