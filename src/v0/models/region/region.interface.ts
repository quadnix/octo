import { IEnvironment } from '../environment/environment.interface';
import { RegionId } from './region.model';

export interface IRegion {
  environments: IEnvironment[];
  regionId: RegionId;
}
