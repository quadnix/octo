import { Diff, DiffAction } from '../../utility/diff.utility';
import { App } from '../app/app.model';
import { Deployment } from '../deployment/deployment.model';
import { IModel } from '../model.interface';

export class Support implements IModel<Support> {
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

  clone(): Support {
    const support = new Support(this.context, this.serverKey);

    this.deployments.forEach((deployment) => {
      support.addDeployment(deployment.clone());
    });

    return support;
  }

  diff(latest: Support): Diff[] {
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
    return [`support=${this.serverKey}`, this.context.getContext()].join(',');
  }
}
