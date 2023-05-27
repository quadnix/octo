import { Environment } from '../environment/environment.model';
import { RegionId } from '../region/region.model';

export interface IApp {
  name: string;
  regions: {
    environments: Environment[];
    regionId: RegionId;
  }[];
  servers: {
    serverKey: string;
  }[];
  supports: {
    serverKey: string;
  }[];
  version: string;
}
