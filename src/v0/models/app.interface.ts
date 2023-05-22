import { Environment } from './environment.model';
import { IRegionId } from './region.model';

export interface IApp {
  name: string;
  regions: {
    environments: Environment[];
    regionId: IRegionId;
  }[];
  servers: {
    serverKey: string;
  }[];
  supports: {
    serverKey: string;
  }[];
  version: string;
}
