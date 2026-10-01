import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';

/**
 * `AwsServerlessSubnetModuleSchema` is the input schema for the `AwsServerlessSubnetModule` module.
 * This schema defines the one subnet of a serverless region. The subnet is always named `default`.
 *
 * @group Modules/Subnet/AwsServerlessSubnet
 *
 * @hideconstructor
 *
 * @see {@link AwsServerlessSubnetModule} to learn more about the `AwsServerlessSubnetModule` module.
 */
export class AwsServerlessSubnetModuleSchema {
  /**
   * The serverless region this subnet covers.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsServerlessRegionAnchorSchema }], NODE_NAME: 'region' },
      },
    },
    {
      destruct: (value: AwsServerlessSubnetModuleSchema['region']): [RegionSchema] => [value.synth()],
      options: {
        isSchema: { schema: RegionSchema },
      },
    },
  ])
  region = Schema<Region>();
}
