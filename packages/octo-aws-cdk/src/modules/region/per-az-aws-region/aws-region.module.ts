import { AModule, AccountType, Module } from '@quadnix/octo';
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import { AwsRegionModuleSchema } from './index.schema.js';
import { AwsRegion } from './models/region/index.js';

/**
 * `AwsRegionModule` is a per-AZ AWS region module that provides an implementation for the `Region` model.
 * This module creates AWS regions within a single availability zone.
 * It establishes the regional foundation for deploying AWS resources within this single availability zone.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsRegionModule } from '@quadnix/octo-aws-cdk/modules/region/per-az-aws-region';
 *
 * octo.loadModule(AwsRegionModule, 'my-region-module', {
 *   account: myAccount,
 *   regionId: RegionId.AWS_US_EAST_1A,
 *   vpcCidrBlock: '10.0.0.0/16'
 * });
 * ```
 *
 * @group Modules/Region/PerAzAwsRegion
 *
 * @reference Resources {@link InternetGatewaySchema}
 * @reference Resources {@link SecurityGroupSchema}
 * @reference Resources {@link VpcSchema}
 *
 * @see {@link AwsRegionModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Region} to learn more about the `Region` model.
 */
@Module<AwsRegionModule>('@octo', AwsRegionModuleSchema)
export class AwsRegionModule extends AModule<AwsRegionModuleSchema, AwsRegion> {
  async onInit(inputs: AwsRegionModuleSchema): Promise<AwsRegion> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new Error('Only AWS accounts are supported in this module!');
    }

    // Create a new region.
    const region = new AwsRegion(inputs.regionId);
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
