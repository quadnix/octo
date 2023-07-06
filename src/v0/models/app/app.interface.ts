import { IImage } from '../image/image.interface';
import { IPipeline } from '../pipeline/pipeline.interface';
import { IRegion } from '../region/region.interface';
import { IServer } from '../server/server.interface';
import { IService } from '../service/service.interface';
import { ISupport } from '../support/support.interface';
import { App } from './app.model';

export interface IApp {
  images: IImage[];
  name: App['name'];
  pipelines: IPipeline[];
  regions: IRegion[];
  servers: IServer[];
  services: IService[];
  supports: ISupport[];
}
