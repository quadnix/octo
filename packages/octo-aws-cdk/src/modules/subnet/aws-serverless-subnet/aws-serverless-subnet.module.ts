import { AModule, Module, ModuleError } from '@quadnix/octo';
import { AwsServerlessSubnetAnchor } from '../../../anchors/aws-subnet/aws-serverless-subnet.anchor.js';
import { AwsServerlessSubnetModuleSchema } from './index.schema.js';
import { AwsServerlessSubnet } from './models/subnet/index.js';

/**
 * `AwsServerlessSubnetModule` is an AWS subnet module that provides an implementation for the `Subnet`
 * model, for serverless regions. It creates nothing: serverless code runs in no network of octo's. The
 * subnet is the one boundary of its region, covers the whole of it, and is always named `default`.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, stub } from '@quadnix/octo';
 * import { AwsServerlessSubnetModule } from '@quadnix/octo-aws-cdk/modules/subnet/aws-serverless-subnet';
 *
 * octo.loadModule(AwsServerlessSubnetModule, 'my-subnet-module', {
 *   region: stub<Region>('${{my-region-module.model.region}}'),
 * });
 * ```
 *
 * @group Modules/Subnet/AwsServerlessSubnet
 *
 * @see {@link AwsServerlessSubnetModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Subnet](/api/octo/class/Subnet) to learn more about the `Subnet` model.
 */
@Module<AwsServerlessSubnetModule>('@octo', AwsServerlessSubnetModuleSchema)
export class AwsServerlessSubnetModule extends AModule<AwsServerlessSubnetModuleSchema, AwsServerlessSubnet> {
  /**
   * Creates the region's one subnet, and anchors it.
   */
  async onInit(inputs: AwsServerlessSubnetModuleSchema): Promise<AwsServerlessSubnet> {
    const region = inputs.region;

    // Validate the region has no subnet yet.
    if ((region.getChildren()['subnet'] || []).length > 0) {
      throw new ModuleError(`Region "${region.regionId}" already has a subnet!`, this.constructor.name);
    }

    // Create a new subnet.
    const subnet = new AwsServerlessSubnet(region, 'default');
    region.addSubnet(subnet);

    // Add anchors.
    subnet.addAnchor(
      new AwsServerlessSubnetAnchor(
        'AwsServerlessSubnetAnchor',
        { serverless: true, subnetName: subnet.subnetName },
        subnet,
      ),
    );

    return subnet;
  }
}
