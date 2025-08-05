import { AModule, type Account, type Filesystem, Module } from '@quadnix/octo';
import { AwsEfsAnchor } from '../../../anchors/aws-efs/aws-efs.anchor.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEfsFilesystemModuleSchema } from './index.schema.js';
import { AwsEfsFilesystem } from './models/filesystem/index.js';

/**
 * `AwsEfsFilesystemModule` is an EFS-based AWS filesystem module
 * that provides an implementation for the `Filesystem` model.
 * This module creates AWS EFS (Elastic File System) filesystems
 * that can be mounted and shared across multiple containers and services.
 * It provides persistent, scalable file storage for containerized applications.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsEfsFilesystemModule } from '@quadnix/octo-aws-cdk/modules/filesystem/aws-efs-filesystem';
 *
 * octo.loadModule(AwsEfsFilesystemModule, 'my-filesystem-module', {
 *   filesystemName: 'shared-data',
 *   region: myRegion
 * });
 * ```
 *
 * @group Modules/Filesystem/AwsEfsFilesystem
 *
 * @reference Resources {@link EfsSchema}
 *
 * @see {@link AwsEfsFilesystemModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Filesystem} to learn more about the `Filesystem` model.
 */
@Module<AwsEfsFilesystemModule>('@octo', AwsEfsFilesystemModuleSchema)
export class AwsEfsFilesystemModule extends AModule<AwsEfsFilesystemModuleSchema, Filesystem> {
  async onInit(inputs: AwsEfsFilesystemModuleSchema): Promise<AwsEfsFilesystem> {
    const region = inputs.region;

    // Create a new filesystem.
    const filesystem = new AwsEfsFilesystem(inputs.filesystemName);
    region.addFilesystem(filesystem);

    // Add anchors.
    filesystem.addAnchor(new AwsEfsAnchor('AwsEfsAnchor', { filesystemName: inputs.filesystemName }, filesystem));

    return filesystem;
  }

  override async registerMetadata(
    inputs: AwsEfsFilesystemModuleSchema,
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
