import { Deployment } from '../deployment/deployment.model';
import { Environment } from '../environment/environment.model';
import { RegionId } from '../region/region.model';
import { Server } from '../server/server.model';
import { Support } from '../support/support.model';

export interface IApp {
  name: string;
  regions: {
    environments: {
      environmentName: Environment['environmentName'];
      environmentVariables: { [key: string]: string };
    }[];
    regionId: RegionId;
  }[];
  servers: {
    deployments: {
      deploymentTag: Deployment['deploymentTag'];
    }[];
    serverKey: Server['serverKey'];
  }[];
  supports: {
    deployments: {
      deploymentTag: Deployment['deploymentTag'];
    }[];
    serverKey: Support['serverKey'];
  }[];
  version: string;
}
