import { Model, Subnet } from '@quadnix/octo';
import { AwsRegion } from '../region/aws.region.model.js';

@Model()
export class AwsSubnet extends Subnet {
  constructor(region: AwsRegion, name: string) {
    super(region, name);
  }
}
