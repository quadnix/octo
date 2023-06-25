import { IEnvironment } from '../environment/environment.interface';
import { Region } from './region.model';

export interface IRegion {
  environments: IEnvironment[];
  regionId: Region['regionId'];
}
