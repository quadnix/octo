import { Deployment } from '../deployment/deployment.model';
import { Model } from '../model.abstract';
import { IServer } from './server.interface';

export class Server extends Model<IServer, Server> {
  readonly MODEL_NAME: string = 'server';

  readonly serverKey: string;

  constructor(serverKey: string) {
    super();
    this.serverKey = serverKey;
  }

  addDeployment(deployment: Deployment): void {
    const childrenDependencies = this.getChildren('deployment');
    if (!childrenDependencies['deployment']) childrenDependencies['deployment'] = [];

    // Check for duplicates.
    const deployments = childrenDependencies['deployment'].map((d) => d.to);
    if (deployments.find((d: Deployment) => d.deploymentTag === deployment.deploymentTag)) {
      throw new Error('Deployment already exists!');
    }
    this.addChild('serverKey', deployment, 'deploymentTag');
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.serverKey}`, app.getContext()].join(',');
  }

  synth(): IServer {
    return {
      serverKey: this.serverKey,
    };
  }

  static async unSynth(server: IServer): Promise<Server> {
    return new Server(server.serverKey);
  }
}
