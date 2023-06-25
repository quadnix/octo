import { IService } from '../service/service.interface';
import { Service } from '../service/service.model';
import { Diff, DiffAction } from '../utility/diff/diff.utility.model';
import { IModel } from '../model.interface';
import { IRegion } from '../region/region.interface';
import { Region } from '../region/region.model';
import { IServer } from '../server/server.interface';
import { Server } from '../server/server.model';
import { ISupport } from '../support/support.interface';
import { Support } from '../support/support.model';
import { IApp } from './app.interface';

export class App implements IModel<IApp, App> {
  readonly name: string;

  readonly regions: Region[] = [];

  readonly servers: Server[] = [];

  readonly services: Service[] = [];

  readonly supports: Support[] = [];

  constructor(name: string) {
    this.name = name;
  }

  addRegion(region: Region): void {
    // Check for duplicates.
    if (this.regions.find((r) => r.regionId === region.regionId)) {
      throw new Error('Region already exists!');
    }

    this.regions.push(region);
  }

  addServer(server: Server): void {
    // Check for duplicates.
    if (this.servers.find((s) => s.serverKey === server.serverKey)) {
      throw new Error('Server already exists!');
    }

    this.servers.push(server);
  }

  addService(service: Service): void {
    // Check for duplicates.
    if (this.services.find((s) => s.serviceId === service.serviceId)) {
      throw new Error('Service already exists!');
    }

    this.services.push(service);
  }

  addSupport(support: Support): void {
    // Check for duplicates.
    if (this.supports.find((s) => s.serverKey === support.serverKey)) {
      throw new Error('Support already exists!');
    }

    this.supports.push(support);
  }

  clone(): App {
    const app = new App(this.name);

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
    const diff: Diff[] = [];

    for (const previousRegion of previous?.regions || []) {
      const region = this.regions.find((r) => r.regionId === previousRegion.regionId);
      if (region) {
        const regionDiff = region.diff(previousRegion);
        if (regionDiff.length !== 0) {
          diff.push(...regionDiff);
        }
      } else {
        diff.push(new Diff(DiffAction.DELETE, previous!.getContext(), 'region', previousRegion.regionId));
      }
    }
    for (const region of this.regions) {
      if (!previous?.regions.find((r) => r.regionId === region.regionId)) {
        diff.push(new Diff(DiffAction.ADD, this.getContext(), 'region', region.regionId));

        const regionDiff = region.diff();
        if (regionDiff.length !== 0) {
          diff.push(...regionDiff);
        }
      }
    }

    for (const previousServer of previous?.servers || []) {
      const server = this.servers.find((s) => s.serverKey === previousServer.serverKey);
      if (server) {
        const serverDiff = server.diff(previousServer);
        if (serverDiff.length !== 0) {
          diff.push(...serverDiff);
        }
      } else {
        diff.push(new Diff(DiffAction.DELETE, previous!.getContext(), 'server', previousServer.serverKey));
      }
    }
    for (const server of this.servers) {
      if (!previous?.servers.find((s) => s.serverKey === server.serverKey)) {
        diff.push(new Diff(DiffAction.ADD, this.getContext(), 'server', server.serverKey));

        const serverDiff = server.diff();
        if (serverDiff.length !== 0) {
          diff.push(...serverDiff);
        }
      }
    }

    for (const previousService of previous?.services || []) {
      const service = this.services.find((s) => s.serviceId === previousService.serviceId);
      if (service) {
        const serviceDiff = service.diff();
        if (serviceDiff.length !== 0) {
          diff.push(...serviceDiff);
        }
      } else {
        diff.push(new Diff(DiffAction.DELETE, previousService, 'service', previousService.serviceId));
      }
    }
    for (const service of this.services) {
      if (!previous?.services.find((s) => s.serviceId === service.serviceId)) {
        diff.push(new Diff(DiffAction.ADD, service, 'service', service.serviceId));

        const serviceDiff = service.diff();
        if (serviceDiff.length !== 0) {
          diff.push(...serviceDiff);
        }
      }
    }

    for (const previousSupport of previous?.supports || []) {
      const support = this.supports.find((s) => s.serverKey === previousSupport.serverKey);
      if (support) {
        const supportDiff = support.diff(previousSupport);
        if (supportDiff.length !== 0) {
          diff.push(...supportDiff);
        }
      } else {
        diff.push(new Diff(DiffAction.DELETE, previous!.getContext(), 'support', previousSupport.serverKey));
      }
    }
    for (const support of this.supports) {
      if (!previous?.supports.find((s) => s.serverKey === support.serverKey)) {
        diff.push(new Diff(DiffAction.ADD, this.getContext(), 'support', support.serverKey));

        const supportDiff = support.diff();
        if (supportDiff.length !== 0) {
          diff.push(...supportDiff);
        }
      }
    }

    return diff;
  }

  getContext(): string {
    return `app=${this.name}`;
  }

  synth(): IApp {
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
      regions,
      servers,
      services,
      supports,
    };
  }
}
