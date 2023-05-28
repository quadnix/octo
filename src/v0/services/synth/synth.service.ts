import { writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { IApp } from '../../models/app/app.interface';
import { App } from '../../models/app/app.model';

const writeFileAsync = promisify(writeFile);

const SYNTH_FILE_NAME = 'infrastructure.json';
const SYNTH_VERSION = 'v0';

export class SynthService {
  readonly app: App;

  readonly version = SYNTH_VERSION;

  constructor(app: App) {
    this.app = app;
  }

  async synth(filePath: string): Promise<void> {
    const output = this.synthReadOnly();
    await writeFileAsync(join(filePath, SYNTH_FILE_NAME), JSON.stringify(output, null, 2));
  }

  synthReadOnly(): IApp {
    const output: IApp = {
      name: this.app.name,
      regions: [],
      servers: [],
      supports: [],
      version: this.version,
    };

    this.app.regions.forEach((r) => {
      const region: IApp['regions'][0] = {
        environments: [],
        regionId: r.regionId,
      };

      r.environments.forEach((e) => {
        region.environments.push({
          environmentName: e.environmentName,
          environmentVariables: Object.fromEntries(e.environmentVariables || new Map()),
        });
      });

      output.regions.push(region);
    });

    this.app.servers.forEach((s) => {
      const server: IApp['servers'][0] = {
        deployments: [],
        serverKey: s.serverKey,
      };

      s.deployments.forEach((d) => {
        server.deployments.push({
          deploymentTag: d.deploymentTag,
        });
      });

      output.servers.push(server);
    });

    this.app.supports.forEach((s) => {
      const support: IApp['supports'][0] = {
        deployments: [],
        serverKey: s.serverKey,
      };

      s.deployments.forEach((d) => {
        support.deployments.push({
          deploymentTag: d.deploymentTag,
        });
      });

      output.supports.push(support);
    });

    return output;
  }
}
