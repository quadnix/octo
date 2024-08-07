import type { IModelReference } from '../model.interface.js';
import type { Subnet } from './subnet.model.js';

/**
 * {@link Subnet} model interface.
 *
 * @group Model Interfaces
 */
export interface ISubnet {
  options: Subnet['options'];
  region: IModelReference;
  subnetId: Subnet['subnetId'];
  subnetName: Subnet['subnetName'];
}
