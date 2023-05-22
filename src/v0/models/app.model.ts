import { writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { IApp } from './app.interface';
import { Region } from './region.model';
import { Server } from './server.model';

const writeFileAsync = promisify(writeFile);

export const SYNTH_FILE_NAME = 'infrastructure.json';

export class App {
  private readonly name: string;
  private regions: Region[];
  private servers: Server[];

  constructor(name: string) {
    this.name = name;
  }

  addRegion(region: Region): void {
    if (!this.regions) {
      this.regions = [];
    }

    // Check for duplicates.
    if (this.regions.find((r) => r.regionId === region.regionId)) {
      throw new Error('Region already exists!');
    }

    this.regions.push(region);
  }

  addServer(server: Server): void {
    if (!this.servers) {
      this.servers = [];
    }

    // Check for duplicates.
    if (this.servers.find((s) => s.serverKey === server.serverKey)) {
      throw new Error('Server already exists!');
    }

    this.servers.push(server);
  }

  async synth(filePath: string): Promise<void> {
    const output = this.synthReadOnly();
    await writeFileAsync(
      join(filePath, SYNTH_FILE_NAME),
      JSON.stringify(output, null, 2),
    );
  }

  synthReadOnly(): IApp {
    const output: IApp = {
      name: this.name,
      regions: [],
      servers: [],
    };

    this.regions?.forEach((r) => {
      output.regions.push({
        regionId: r.regionId,
      });
    });

    this.servers?.forEach((s) => {
      output.servers.push({
        serverKey: s.serverKey,
      });
    });

    return output;
  }
}
