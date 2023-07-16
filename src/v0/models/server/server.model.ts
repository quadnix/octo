import { IDeployment } from '../deployment/deployment.interface';
import { Deployment } from '../deployment/deployment.model';
import { HOOK_NAMES } from '../hook.interface';
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

    this.hookService.applyHooks(HOOK_NAMES.ADD_DEPLOYMENT);
  }

  clone(): Server {
    const server = new Server(this.serverKey);
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['deployment']) childrenDependencies['deployment'] = [];

    childrenDependencies['deployment'].forEach((dependency) => {
      server.addDeployment((dependency.to as Deployment).clone());
    });

    return server;
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.serverKey}`, app.getContext()].join(',');
  }

  synth(): IServer {
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['deployment']) childrenDependencies['deployment'] = [];

    const deployments: IDeployment[] = [];
    childrenDependencies['deployment'].forEach((dependency) => {
      deployments.push((dependency.to as Deployment).synth());
    });

    return {
      deployments,
      serverKey: this.serverKey,
    };
  }
}
