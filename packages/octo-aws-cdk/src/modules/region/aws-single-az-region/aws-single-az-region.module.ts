import { AModule, AccountType, Module } from '@quadnix/octo';
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
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
 *   regionId: RegionId.AWS_US_EAST_1A,
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
      throw new Error('Only AWS accounts are supported in this module!');
    }

    // Create a new region.
    const region = new AwsSingleAzRegion(inputs.regionId);
    account.addRegion(region);

    // Add anchors.
    const awsRegionAnchor = new AwsRegionAnchor(
      'AwsRegionAnchor',
      {
        awsRegionAZs: region.awsRegionAZs,
        awsRegionId: region.awsRegionId,
        regionId: region.regionId,
      },
      region,
    );
    region.addAnchor(awsRegionAnchor);

    return region;
  }
}
