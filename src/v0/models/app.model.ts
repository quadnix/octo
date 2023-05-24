import { Region } from './region.model';
import { Server } from './server.model';
import { Support } from './support.model';

export class App {
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
}
