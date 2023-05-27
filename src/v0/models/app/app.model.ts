import { Diff, DiffAction } from '../../utility/diff.utility';
import { IModel } from '../model.interface';
import { Region } from '../region/region.model';
import { Server } from '../server/server.model';
import { Support } from '../support/support.model';

export class App implements IModel<App> {
  readonly name: string;

  readonly regions: Region[] = [];

  readonly servers: Server[] = [];

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

    this.supports.forEach((support) => {
      app.addSupport(support.clone());
    });

    return app;
  }

  diff(latest: App): Diff[] {
    const diff: Diff[] = [];

    for (const region of this.regions) {
      const regionInLatest = latest.regions.find(
        (r) => r.regionId === region.regionId,
      );
      if (!regionInLatest) {
        diff.push(new Diff(DiffAction.DELETE, 'region', region.regionId));
      } else {
        const regionDiff = region.diff(regionInLatest);
        if (regionDiff.length !== 0) {
          diff.push(...regionDiff);
        }
      }
    }

    for (const region of latest.regions) {
      if (!this.regions.find((r) => r.regionId === region.regionId)) {
        diff.push(new Diff(DiffAction.ADD, 'region', region.regionId));
      }
    }

    for (const server of this.servers) {
      const serverInLatest = latest.servers.find(
        (s) => s.serverKey === server.serverKey,
      );
      if (!serverInLatest) {
        diff.push(new Diff(DiffAction.DELETE, 'server', server.serverKey));
      } else {
        const serverDiff = server.diff(serverInLatest);
        if (serverDiff.length !== 0) {
          diff.push(...serverDiff);
        }
      }
    }

    for (const server of latest.servers) {
      if (!this.servers.find((s) => s.serverKey === server.serverKey)) {
        diff.push(new Diff(DiffAction.ADD, 'server', server.serverKey));
      }
    }

    for (const support of this.supports) {
      const supportInLatest = latest.supports.find(
        (s) => s.serverKey === support.serverKey,
      );
      if (!supportInLatest) {
        diff.push(new Diff(DiffAction.DELETE, 'support', support.serverKey));
      } else {
        const supportDiff = support.diff(supportInLatest);
        if (supportDiff.length !== 0) {
          diff.push(...supportDiff);
        }
      }
    }

    for (const support of latest.supports) {
      if (!this.supports.find((s) => s.serverKey === support.serverKey)) {
        diff.push(new Diff(DiffAction.ADD, 'support', support.serverKey));
      }
    }

    return diff;
  }
}
