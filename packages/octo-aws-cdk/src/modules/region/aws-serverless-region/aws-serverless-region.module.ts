import { AModule, AccountType, Module, ModuleError, type Region } from '@quadnix/octo';
import { AwsServerlessRegionAnchor } from '../../../anchors/aws-region/aws-serverless-region.anchor.js';
import { AwsServerlessRegionModuleSchema } from './index.schema.js';
import { AwsServerlessRegion } from './models/region/index.js';

/**
 * `AwsServerlessRegionModule` is an AWS region module that provides an implementation for the `Region` model,
 * for things that need a region but no network of their own, such as a static website bucket.
 * It creates no resources: no VPC, no subnets, no gateways.
 * The region exists so that what lives in it is drawn where it lives.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Account, stub } from '@quadnix/octo';
 * import { AwsServerlessRegionModule } from '@quadnix/octo-aws-cdk/modules/region/aws-serverless-region';
 * import { AwsServerlessRegionId } from '@quadnix/octo-aws-cdk/modules/region/aws-serverless-region/schema';
 *
 * octo.loadModule(AwsServerlessRegionModule, 'my-region-module', {
 *   account: stub<Account>('${{my-account-module.model.account}}'),
 *   name: 'my-region',
 *   regionId: AwsServerlessRegionId.AWS_US_EAST_1,
 * });
 * ```
 *
 * @group Modules/Region/AwsServerlessRegion
 *
 * @see {@link AwsServerlessRegionModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Region](/api/octo/class/Region) to learn more about the `Region` model.
 */
@Module<AwsServerlessRegionModule>('@octo', AwsServerlessRegionModuleSchema)
export class AwsServerlessRegionModule extends AModule<AwsServerlessRegionModuleSchema, AwsServerlessRegion> {
  /**
   * Creates the region under the account, and anchors its AWS region ID for other modules to find.
   */
  async onInit(inputs: AwsServerlessRegionModuleSchema): Promise<AwsServerlessRegion> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new ModuleError('Only AWS accounts are supported in this module!', this.constructor.name);
    }

    // Check for unique regionId.
    const accountRegions = account.getChildren()['region']?.map((r) => r.to as Region) || [];
    if (accountRegions.some((r) => r.regionId === inputs.name)) {
      throw new ModuleError(`Region "${inputs.name}" already exists!`, this.constructor.name);
    }

    // Create a new region.
    const region = new AwsServerlessRegion(inputs.name, inputs.regionId);
    account.addRegion(region);

    // Add anchors.
    region.addAnchor(
      new AwsServerlessRegionAnchor(
        'AwsServerlessRegionAnchor',
        { awsRegionId: region.awsRegionId, regionId: region.regionId, serverless: true },
        region,
      ),
    );

    return region;
  }
}
