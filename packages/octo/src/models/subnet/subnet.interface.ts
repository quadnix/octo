import { IModelReference } from '../model.interface.js';
import { Subnet } from './subnet.model.js';

export interface ISubnet {
  options: Subnet['options'];
  region: IModelReference;
  subnetId: Subnet['subnetId'];
  subnetName: Subnet['subnetName'];
}
