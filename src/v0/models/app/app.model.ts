import { HOOK_NAMES } from '../hook.interface';
import { IImage } from '../image/image.interface';
import { Image } from '../image/image.model';
import { Model } from '../model.abstract';
import { IPipeline } from '../pipeline/pipeline.interface';
import { Pipeline } from '../pipeline/pipeline.model';
import { IRegion } from '../region/region.interface';
import { Region } from '../region/region.model';
import { IServer } from '../server/server.interface';
import { Server } from '../server/server.model';
import { IService } from '../service/service.interface';
import { Service } from '../service/service.model';
import { ISupport } from '../support/support.interface';
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
      throw new Error('Environment already exists!');
    }
    this.addChild('name', image, 'imageId');

    this.hookService.applyHooks(HOOK_NAMES.ADD_IMAGE);
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

    this.hookService.applyHooks(HOOK_NAMES.ADD_PIPELINE);
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

    this.hookService.applyHooks(HOOK_NAMES.ADD_REGION);
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

    this.hookService.applyHooks(HOOK_NAMES.ADD_SERVER);
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

    this.hookService.applyHooks(HOOK_NAMES.ADD_SERVICE);
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

    this.hookService.applyHooks(HOOK_NAMES.ADD_SUPPORT);
  }

  clone(): App {
    const app = new App(this.name);
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['image']) childrenDependencies['image'] = [];
    if (!childrenDependencies['pipeline']) childrenDependencies['pipeline'] = [];
    if (!childrenDependencies['region']) childrenDependencies['region'] = [];
    if (!childrenDependencies['server']) childrenDependencies['server'] = [];
    if (!childrenDependencies['service']) childrenDependencies['service'] = [];
    if (!childrenDependencies['support']) childrenDependencies['support'] = [];

    childrenDependencies['image'].forEach((dependency) => {
      app.addImage((dependency.to as Image).clone());
    });

    childrenDependencies['pipeline'].forEach((dependency) => {
      app.addPipeline((dependency.to as Pipeline).clone());
    });

    childrenDependencies['region'].forEach((dependency) => {
      app.addRegion((dependency.to as Region).clone());
    });

    childrenDependencies['server'].forEach((dependency) => {
      app.addServer((dependency.to as Server).clone());
    });

    childrenDependencies['service'].forEach((dependency) => {
      app.addService((dependency.to as Service).clone());
    });

    childrenDependencies['support'].forEach((dependency) => {
      app.addSupport((dependency.to as Support).clone());
    });

    return app;
  }

  getContext(): string {
    return `${this.MODEL_NAME}=${this.name}`;
  }

  synth(): IApp {
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['image']) childrenDependencies['image'] = [];
    if (!childrenDependencies['pipeline']) childrenDependencies['pipeline'] = [];
    if (!childrenDependencies['region']) childrenDependencies['region'] = [];
    if (!childrenDependencies['server']) childrenDependencies['server'] = [];
    if (!childrenDependencies['service']) childrenDependencies['service'] = [];
    if (!childrenDependencies['support']) childrenDependencies['support'] = [];

    const images: IImage[] = [];
    childrenDependencies['image'].forEach((dependency) => {
      images.push((dependency.to as Image).synth());
    });

    const pipelines: IPipeline[] = [];
    childrenDependencies['pipeline'].forEach((dependency) => {
      pipelines.push((dependency.to as Pipeline).synth());
    });

    const regions: IRegion[] = [];
    childrenDependencies['region'].forEach((dependency) => {
      regions.push((dependency.to as Region).synth());
    });

    const servers: IServer[] = [];
    childrenDependencies['server'].forEach((dependency) => {
      servers.push((dependency.to as Server).synth());
    });

    const services: IService[] = [];
    childrenDependencies['service'].forEach((dependency) => {
      services.push((dependency.to as Service).synth());
    });

    const supports: ISupport[] = [];
    childrenDependencies['support'].forEach((dependency) => {
      supports.push((dependency.to as Support).synth());
    });

    return {
      images,
      name: this.name,
      pipelines,
      regions,
      servers,
      services,
      supports,
    };
  }
}
