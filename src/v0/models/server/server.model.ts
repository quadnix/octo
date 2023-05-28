import { Diff, DiffAction } from '../../utility/diff.utility';
import { App } from '../app/app.model';
import { Deployment } from '../deployment/deployment.model';
import { IModel } from '../model.interface';

export class Server implements IModel<Server> {
  readonly context: App;

  readonly deployments: Deployment[] = [];

  readonly serverKey: string;

  constructor(context: App, serverKey: string) {
    this.context = context;
    this.serverKey = serverKey;
  }

  addDeployment(deployment: Deployment): void {
    // Check for duplicates.
    if (
      this.deployments.find((d) => d.deploymentTag === deployment.deploymentTag)
    ) {
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

  diff(latest: Server): Diff[] {
    const diff: Diff[] = [];

    for (const deployment of this.deployments) {
      const deploymentInLatest = latest.deployments.find(
        (d) => d.deploymentTag === deployment.deploymentTag,
      );
      if (!deploymentInLatest) {
        diff.push(
          new Diff(
            DiffAction.DELETE,
            this.getContext(),
            'deployment',
            deployment.deploymentTag,
          ),
        );
      } else {
        const deploymentDiff = deployment.diff(deploymentInLatest);
        if (deploymentDiff.length !== 0) {
          diff.push(...deploymentDiff);
        }
      }
    }

    for (const deployment of latest.deployments) {
      if (
        !this.deployments.find(
          (d) => d.deploymentTag === deployment.deploymentTag,
        )
      ) {
        diff.push(
          new Diff(
            DiffAction.ADD,
            this.getContext(),
            'deployment',
            deployment.deploymentTag,
          ),
        );
      }
    }

    return diff;
  }

  getContext(): string {
    return [`server=${this.serverKey}`, this.context.getContext()].join(',');
  }
}
