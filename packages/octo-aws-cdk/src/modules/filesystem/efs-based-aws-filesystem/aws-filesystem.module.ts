import { AModule, type Account, type Filesystem, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EfsFilesystemAnchor } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.js';
import { AwsFilesystemModuleSchema } from './index.schema.js';
import { AwsFilesystem } from './models/filesystem/index.js';

/**
 * `AwsFilesystemModule` is an EFS-based AWS filesystem module
 * that provides an implementation for the `Filesystem` model.
 * This module creates AWS EFS (Elastic File System) filesystems
 * that can be mounted and shared across multiple containers and services.
 * It provides persistent, scalable file storage for containerized applications.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsFilesystemModule } from '@quadnix/octo-aws-cdk/modules/filesystem/efs-based-aws-filesystem';
 *
 * octo.loadModule(AwsFilesystemModule, 'my-filesystem-module', {
 *   filesystemName: 'shared-data',
 *   region: myRegion
 * });
 * ```
 *
 * @group Modules/Filesystem/EfsBasedAwsFilesystem
 *
 * @reference Resources {@link EfsSchema}
 *
 * @see {@link AwsFilesystemModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Filesystem} to learn more about the `Filesystem` model.
 */
@Module<AwsFilesystemModule>('@octo', AwsFilesystemModuleSchema)
export class AwsFilesystemModule extends AModule<AwsFilesystemModuleSchema, Filesystem> {
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
