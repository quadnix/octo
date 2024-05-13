import { IModelReference } from '../model.interface.js';
import { Subnet } from './subnet.model.js';

export interface ISubnet {
  region: IModelReference;
  subnetId: Subnet['subnetId'];
  subnetName: Subnet['subnetName'];
}
