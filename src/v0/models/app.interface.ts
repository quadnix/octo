import { IRegionId } from './region.model';

export interface IApp {
  name: string;
  regions: {
    regionId: IRegionId;
  }[];
  servers: {
    serverKey: string;
  }[];
}
