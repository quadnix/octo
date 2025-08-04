import { AModule, AccountType, Module, type Region } from '@quadnix/octo';
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { CidrUtility } from '../../../utilities/cidr/cidr.utility.js';
import { AwsMultiAzRegionModuleSchema } from './index.schema.js';
import { AwsMultiAzRegion } from './models/region/index.js';

/**
 * `AwsMultiAzRegionModule` is a multi-AZ AWS region module that provides an implementation for the `Region` model.
 * This module creates AWS regions within multiple availability zones.
 * It establishes the regional foundation for deploying AWS resources within multiple availability zones.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsMultiAzRegionModule } from '@quadnix/octo-aws-cdk/modules/region/aws-multi-az-region';
 *
 * octo.loadModule(AwsMultiAzRegionModule, 'my-region-module', {
 *   account: myAccount,
 *   regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
 *   vpcCidrBlock: '10.0.0.0/16'
 * });
 * ```
 *
 * @group Modules/Region/AwsMultiAzRegion
 *
 * @reference Resources {@link InternetGatewaySchema}
 * @reference Resources {@link VpcSchema}
 *
 * @see {@link AwsMultiAzRegionModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Region} to learn more about the `Region` model.
 */
@Module<AwsMultiAzRegionModule>('@octo', AwsMultiAzRegionModuleSchema)
export class AwsMultiAzRegionModule extends AModule<AwsMultiAzRegionModuleSchema, AwsMultiAzRegion> {
  async onInit(inputs: AwsMultiAzRegionModuleSchema): Promise<AwsMultiAzRegion> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new Error('Only AWS accounts are supported in this module!');
    }

    // Check for minimum regionIds.
    if (inputs.regionIds.length < 2) {
      throw new Error('At least 2 regionIds are required!');
    }

    // Check for overlapping cidr regions. This ensures correctness in VPC peering.
    const accountRegions = account.getChildren()['region']?.map((r) => r.to as Region) || [];
    const accountRegionCidrBlocks = (
      await Promise.all(
        accountRegions.map((r) =>
          r.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], { searchBoundaryMembers: false }),
        ),
      )
    ).flat();
    if (
      accountRegionCidrBlocks.some((c) =>
        CidrUtility.hasOverlap([c.getSchemaInstance().properties.vpcCidrBlock], [inputs.vpcCidrBlock]),
      )
    ) {
      throw new Error('Overlapping VPC cidr blocks are not allowed!');
    }

    // Check for unique regionId.
    if (accountRegions.some((r) => r.regionId === `${this.moduleId}-${inputs.name}`)) {
      throw new Error(`Region "${inputs.name}" already exists!`);
    }

    // Create a new region.
    const region = new AwsMultiAzRegion(`${this.moduleId}-${inputs.name}`, inputs.regionIds);
    account.addRegion(region);

    // Add anchors.
    const awsRegionAnchor = new AwsRegionAnchor(
      'AwsRegionAnchor',
      {
        awsRegionAZs: region.awsRegionAZs,
        awsRegionId: region.awsRegionId,
        regionId: region.regionId,
        vpcCidrBlock: inputs.vpcCidrBlock,
      },
      region,
    );
    region.addAnchor(awsRegionAnchor);

    return region;
  }
}
