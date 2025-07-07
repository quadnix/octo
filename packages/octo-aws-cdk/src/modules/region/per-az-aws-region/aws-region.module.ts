import { AModule, AccountType, Module } from '@quadnix/octo';
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import { AwsRegionModuleSchema } from './index.schema.js';
import { AwsRegion } from './models/region/index.js';

/**
 * @group Modules/Region/PerAzAwsRegion
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
