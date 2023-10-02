import { Image } from '../image/image.model';
import { Model } from '../model.abstract';
import { Pipeline } from '../pipeline/pipeline.model';
import { Region } from '../region/region.model';
import { Server } from '../server/server.model';
import { Service } from '../service/service.model';
import { Support } from '../support/support.model';
import { IApp } from './app.interface';

export class App extends Model<IApp, App> {
  readonly MODEL_NAME: string = 'app';

  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  addImage(image: Image): void {
    const childrenDependencies = this.getChildren('image');
    if (!childrenDependencies['image']) childrenDependencies['image'] = [];

    // Check for duplicates.
    const images = childrenDependencies['image'].map((d) => d.to);
    if (images.find((i: Image) => i.imageId === image.imageId)) {
      throw new Error('Image already exists!');
    }
    this.addChild('name', image, 'imageId');
  }

  addPipeline(pipeline: Pipeline): void {
    const childrenDependencies = this.getChildren('pipeline');
    if (!childrenDependencies['pipeline']) childrenDependencies['pipeline'] = [];

    // Check for duplicates.
    const pipelines = childrenDependencies['pipeline'].map((d) => d.to);
    if (pipelines.find((p: Pipeline) => p.pipelineName === pipeline.pipelineName)) {
      throw new Error('Pipeline already exists!');
    }
    this.addChild('name', pipeline, 'pipelineName');
  }

  addRegion(region: Region): void {
    const childrenDependencies = this.getChildren('region');
    if (!childrenDependencies['region']) childrenDependencies['region'] = [];

    // Check for duplicates.
    const regions = childrenDependencies['region'].map((d) => d.to);
    if (regions.find((r: Region) => r.regionId === region.regionId)) {
      throw new Error('Region already exists!');
    }
    this.addChild('name', region, 'regionId');
  }

  addServer(server: Server): void {
    const childrenDependencies = this.getChildren('server');
    if (!childrenDependencies['server']) childrenDependencies['server'] = [];

    // Check for duplicates.
    const servers = childrenDependencies['server'].map((d) => d.to);
    if (servers.find((s: Server) => s.serverKey === server.serverKey)) {
      throw new Error('Server already exists!');
    }
    this.addChild('name', server, 'serverKey');
  }

  addService(service: Service): void {
    const childrenDependencies = this.getChildren('service');
    if (!childrenDependencies['service']) childrenDependencies['service'] = [];

    // Check for duplicates.
    const services = childrenDependencies['service'].map((d) => d.to);
    if (services.find((s: Service) => s.serviceId === service.serviceId)) {
      throw new Error('Service already exists!');
    }
    this.addChild('name', service, 'serviceId');
  }

  addSupport(support: Support): void {
    const childrenDependencies = this.getChildren('support');
    if (!childrenDependencies['support']) childrenDependencies['support'] = [];

    // Check for duplicates.
    const supports = childrenDependencies['support'].map((d) => d.to);
    if (supports.find((s: Support) => s.serverKey === support.serverKey)) {
      throw new Error('Support already exists!');
    }
    this.addChild('name', support, 'serverKey');
  }

  getContext(): string {
    return `${this.MODEL_NAME}=${this.name}`;
  }

  synth(): IApp {
    return {
      name: this.name,
    };
  }

  static async unSynth(app: IApp): Promise<App> {
    return new App(app.name);
  }
}
