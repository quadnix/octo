import { IRegion } from '../region/region.interface';
import { IServer } from '../server/server.interface';
import { ISupport } from '../support/support.interface';

export interface IApp {
  name: string;
  regions: IRegion[];
  servers: IServer[];
  supports: ISupport[];
}
