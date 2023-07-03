import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { DiffUtility } from '../../functions/diff/diff.utility';
import { IDeployment } from '../deployment/deployment.interface';
import { Deployment } from '../deployment/deployment.model';
import { Model } from '../model.abstract';
import { IServer } from './server.interface';

export class Server extends Model<IServer, Server> {
  readonly MODEL_NAME: string = 'server';

  readonly deployments: Deployment[] = [];

  readonly serverKey: string;

  constructor(serverKey: string) {
    super();
    this.serverKey = serverKey;
  }

  addDeployment(deployment: Deployment): void {
    // Check for duplicates.
    if (this.deployments.find((d) => d.deploymentTag === deployment.deploymentTag)) {
      throw new Error('Deployment already exists!');
    }

    // Define parent-child dependency.
    deployment.addDependency('deploymentTag', DiffAction.ADD, this, 'serverKey', DiffAction.ADD);
    deployment.addDependency('deploymentTag', DiffAction.ADD, this, 'serverKey', DiffAction.UPDATE);
    this.addDependency('serverKey', DiffAction.DELETE, deployment, 'deploymentTag', DiffAction.DELETE);

    this.deployments.push(deployment);
  }

  clone(): Server {
    const server = new Server(this.serverKey);

    this.deployments.forEach((deployment) => {
      server.addDeployment(deployment.clone());
    });

    return server;
  }

  diff(previous?: Server): Diff[] {
    // Generate diff of deployments.
    return DiffUtility.diffModels(previous?.deployments || [], this.deployments, 'deployments', 'deploymentTag');
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
