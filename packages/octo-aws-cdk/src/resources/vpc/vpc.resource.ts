import { AResource, Diff, Resource, ResourceError } from '@quadnix/octo';
import { VpcSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Vpc>('@octo', 'vpc', VpcSchema)
export class Vpc extends AResource<VpcSchema, Vpc> {
  declare properties: VpcSchema['properties'];
  declare response: VpcSchema['response'];

  constructor(resourceId: string, properties: VpcSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: Vpc): Promise<Diff[]> {
    const previousAZs = [...previous.properties.awsAvailabilityZones].sort();
    const currentAZs = [...this.properties.awsAvailabilityZones].sort();
    const isAZsSame = previousAZs.every((element) => currentAZs.indexOf(element) > -1);

    if (
      previous.properties.awsAccountId !== this.properties.awsAccountId ||
      previous.properties.awsRegionId !== this.properties.awsRegionId ||
      previous.properties.CidrBlock !== this.properties.CidrBlock ||
      !isAZsSame
    ) {
      throw new ResourceError('Cannot update VPC once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
