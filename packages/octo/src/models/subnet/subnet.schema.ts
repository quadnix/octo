import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';
import type { IModelReference } from '../model.interface.js';

/**
 * The type of subnet.
 */
export enum SubnetType {
  /**
   * A public subnet is open to the internet,
   * i.e. an {@link Execution} within this subnet can be accessed from the internet.
   * Other than access from the internet, any other access needs to be explicitly allowed.
   */
  PUBLIC = 'public',

  /**
   * A private subnet has limited access to anything outside of this subnet, including access from the internet.
   * Access to this subnet needs to be explicitly allowed.
   */
  PRIVATE = 'private',
}

export class SubnetSchema {
  options = Schema<{ disableSubnetIntraNetwork: boolean; subnetType: SubnetType }>();

  region = Schema<IModelReference>();

  /**
   * The ID of the subnet.
   * - Format is `{regionId}-{subnetName}`
   */
  subnetId = Schema<string>();

  /**
   * The name of the subnet.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  subnetName = Schema<string>();
}
