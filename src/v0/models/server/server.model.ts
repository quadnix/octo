import { DiffUtility } from '../../functions/diff/diff.utility';
import { Diff } from '../../functions/diff/diff.model';
import { App } from '../app/app.model';
import { IDeployment } from '../deployment/deployment.interface';
import { Deployment } from '../deployment/deployment.model';
import { IModel } from '../model.interface';
import { IServer } from './server.interface';

export class Server implements IModel<IServer, Server> {
  readonly context: App;

  readonly deployments: Deployment[] = [];

  readonly serverKey: string;

  constructor(context: App, serverKey: string) {
    this.context = context;
    this.serverKey = serverKey;
  }

  addDeployment(deployment: Deployment): void {
    // Check for duplicates.
    if (this.deployments.find((d) => d.deploymentTag === deployment.deploymentTag)) {
      throw new Error('Deployment already exists!');
    }

    this.deployments.push(deployment);
  }

  clone(): Server {
    const server = new Server(this.context, this.serverKey);

    this.deployments.forEach((deployment) => {
      server.addDeployment(deployment.clone());
    });

    return server;
  }

  diff(previous?: Server): Diff[] {
    // Generate diff of deployments.
    return DiffUtility.diffModels(previous?.deployments || [], this.deployments, 'deployment', 'deploymentTag');
  }

  getContext(): string {
    return [`server=${this.serverKey}`, this.context.getContext()].join(',');
  }

  synth(): IServer {
    const deployments: IDeployment[] = [];
    this.deployments.forEach((deployment) => {
      deployments.push(deployment.synth());
    });

    return {
      deployments,
      serverKey: this.serverKey,
    };
  }
}
