import { IRegion } from '../region/region.interface';
import { IServer } from '../server/server.interface';
import { IService } from '../service/service.interface';
import { ISupport } from '../support/support.interface';
import { App } from './app.model';

export interface IApp {
  name: App['name'];
  regions: IRegion[];
  servers: IServer[];
  services: IService[];
  supports: ISupport[];
}
