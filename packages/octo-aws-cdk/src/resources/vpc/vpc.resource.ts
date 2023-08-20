import { Resource } from '@quadnix/octo';
import { IVpcProperties } from './vpc.interface';

export class Vpc extends Resource<Vpc> {
  readonly MODEL_NAME: string = 'vpc';

  constructor(resourceId: string, properties: IVpcProperties) {
    super(resourceId);

    this.properties.CidrBlock = properties.CidrBlock;
    this.properties.InstanceTenancy = properties.InstanceTenancy;
  }
}
