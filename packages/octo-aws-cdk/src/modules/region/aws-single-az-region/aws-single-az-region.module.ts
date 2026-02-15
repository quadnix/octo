import { AModule, AccountType, Module, ModuleError, type Region } from '@quadnix/octo';
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { CidrUtility } from '../../../utilities/cidr/cidr.utility.js';
import { AwsSingleAzRegionModuleSchema } from './index.schema.js';
import { AwsSingleAzRegion } from './models/region/index.js';

/**
 * `AwsSingleAzRegionModule` is a per-AZ AWS region module that provides an implementation for the `Region` model.
 * This module creates AWS regions within a single availability zone.
 * It establishes the regional foundation for deploying AWS resources within this single availability zone.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsSingleAzRegionModule } from '@quadnix/octo-aws-cdk/modules/region/aws-single-az-region';
 *
 * octo.loadModule(AwsSingleAzRegionModule, 'my-region-module', {
 *   account: myAccount,
 *   regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
 *   vpcCidrBlock: '10.0.0.0/16'
 * });
 * ```
 *
 * @group Modules/Region/AwsSingleAzRegion
 *
 * @reference Resources {@link InternetGatewaySchema}
 * @reference Resources {@link VpcSchema}
 *
 * @see {@link AwsSingleAzRegionModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Region} to learn more about the `Region` model.
 */
@Module<AwsSingleAzRegionModule>('@octo', AwsSingleAzRegionModuleSchema)
export class AwsSingleAzRegionModule extends AModule<AwsSingleAzRegionModuleSchema, AwsSingleAzRegion> {
  async onInit(inputs: AwsSingleAzRegionModuleSchema): Promise<AwsSingleAzRegion> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new ModuleError('Only AWS accounts are supported in this module!', this.constructor.name);
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
      throw new ModuleError('Overlapping VPC cidr blocks are not allowed!', this.constructor.name);
    }

    // Check for unique regionId.
    if (accountRegions.some((r) => r.regionId === `${inputs.name}`)) {
      throw new ModuleError(`Region "${inputs.name}" already exists!`, this.constructor.name);
    }

    // Create a new region.
    const region = new AwsSingleAzRegion(`${inputs.name}`, inputs.regionId);
    account.addRegion(region);

    // Add anchors.
    region.addAnchor(
      new AwsRegionAnchor(
        'AwsRegionAnchor',
        {
          awsRegionAZs: region.awsRegionAZs,
          awsRegionId: region.awsRegionId,
          regionId: region.regionId,
          vpcCidrBlock: inputs.vpcCidrBlock,
        },
        region,
      ),
    );

    return region;
  }
}
