import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { DiffUtility } from '../../functions/diff/diff.utility';
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

  readonly pipelines: Pipeline[] = [];

  readonly regions: Region[] = [];

  readonly servers: Server[] = [];

  readonly services: Service[] = [];

  readonly supports: Support[] = [];

  constructor(name: string) {
    super();
    this.name = name;
  }

  addPipeline(pipeline: Pipeline): void {
    // Check for duplicates.
    if (this.pipelines.find((p) => p.pipelineName === pipeline.pipelineName)) {
      throw new Error('Pipeline already exists!');
    }

    // Define parent-child dependency.
    pipeline.addDependency('pipelineName', DiffAction.ADD, this, 'name', DiffAction.ADD);
    pipeline.addDependency('pipelineName', DiffAction.ADD, this, 'name', DiffAction.UPDATE);
    this.addDependency('name', DiffAction.DELETE, pipeline, 'pipelineName', DiffAction.DELETE);

    this.pipelines.push(pipeline);
  }

  addRegion(region: Region): void {
    // Check for duplicates.
    if (this.regions.find((r) => r.regionId === region.regionId)) {
      throw new Error('Region already exists!');
    }

    // Define parent-child dependency.
    region.addDependency('regionId', DiffAction.ADD, this, 'name', DiffAction.ADD);
    region.addDependency('regionId', DiffAction.ADD, this, 'name', DiffAction.UPDATE);
    this.addDependency('name', DiffAction.DELETE, region, 'regionId', DiffAction.DELETE);

    this.regions.push(region);
  }

  addServer(server: Server): void {
    // Check for duplicates.
    if (this.servers.find((s) => s.serverKey === server.serverKey)) {
      throw new Error('Server already exists!');
    }

    // Define parent-child dependency.
    server.addDependency('serverKey', DiffAction.ADD, this, 'name', DiffAction.ADD);
    server.addDependency('serverKey', DiffAction.ADD, this, 'name', DiffAction.UPDATE);
    this.addDependency('name', DiffAction.DELETE, server, 'serverKey', DiffAction.DELETE);

    this.servers.push(server);
  }

  addService(service: Service): void {
    // Check for duplicates.
    if (this.services.find((s) => s.serviceId === service.serviceId)) {
      throw new Error('Service already exists!');
    }

    // Define parent-child dependency.
    service.addDependency('serviceId', DiffAction.ADD, this, 'name', DiffAction.ADD);
    service.addDependency('serviceId', DiffAction.ADD, this, 'name', DiffAction.UPDATE);
    this.addDependency('name', DiffAction.DELETE, service, 'serviceId', DiffAction.DELETE);

    this.services.push(service);
  }

  addSupport(support: Support): void {
    // Check for duplicates.
    if (this.supports.find((s) => s.serverKey === support.serverKey)) {
      throw new Error('Support already exists!');
    }

    // Define parent-child dependency.
    support.addDependency('serverKey', DiffAction.ADD, this, 'name', DiffAction.ADD);
    support.addDependency('serverKey', DiffAction.ADD, this, 'name', DiffAction.UPDATE);
    this.addDependency('name', DiffAction.DELETE, support, 'serverKey', DiffAction.DELETE);

    this.supports.push(support);
  }

  clone(): App {
    const app = new App(this.name);

    this.pipelines.forEach((pipeline) => {
      app.addPipeline(pipeline.clone());
    });

    this.regions.forEach((region) => {
      app.addRegion(region.clone());
    });

    this.servers.forEach((server) => {
      app.addServer(server.clone());
    });

    this.services.forEach((service) => {
      app.addService(service.clone());
    });

    this.supports.forEach((support) => {
      app.addSupport(support.clone());
    });

    return app;
  }

  diff(previous?: App): Diff[] {
    return [
      ...DiffUtility.diffModels(previous?.pipelines || [], this.pipelines, 'pipelines', 'pipelineName'),
      ...DiffUtility.diffModels(previous?.regions || [], this.regions, 'regions', 'regionId'),
      ...DiffUtility.diffModels(previous?.servers || [], this.servers, 'servers', 'serverKey'),
      ...DiffUtility.diffModels(previous?.services || [], this.services, 'services', 'serviceId'),
      ...DiffUtility.diffModels(previous?.supports || [], this.supports, 'supports', 'serverKey'),
    ];
  }

  synth(): IApp {
    const pipelines: IPipeline[] = [];
    this.pipelines.forEach((pipeline) => {
      pipelines.push(pipeline.synth());
    });

    const regions: IRegion[] = [];
    this.regions.forEach((region) => {
      regions.push(region.synth());
    });

    const servers: IServer[] = [];
    this.servers.forEach((server) => {
      servers.push(server.synth());
    });

    const services: IService[] = [];
    this.services.forEach((service) => {
      services.push(service.synth());
    });

    const supports: ISupport[] = [];
    this.supports.forEach((support) => {
      supports.push(support.synth());
    });

    return {
      name: this.name,
      pipelines,
      regions,
      servers,
      services,
      supports,
    };
  }
}
