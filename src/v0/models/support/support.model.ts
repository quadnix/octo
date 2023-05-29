import { Diff, DiffAction } from '../../utility/diff.utility';
import { App } from '../app/app.model';
import { IDeployment } from '../deployment/deployment.interface';
import { Deployment } from '../deployment/deployment.model';
import { IModel } from '../model.interface';
import { ISupport } from './support.interface';

export class Support implements IModel<ISupport, Support> {
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

  clone(): Support {
    const support = new Support(this.context, this.serverKey);

    this.deployments.forEach((deployment) => {
      support.addDeployment(deployment.clone());
    });

    return support;
  }

  diff(previous?: Support): Diff[] {
    const diff: Diff[] = [];

    for (const previousDeployment of previous?.deployments || []) {
      const deployment = this.deployments.find((d) => d.deploymentTag === previousDeployment.deploymentTag);
      if (deployment) {
        const deploymentDiff = deployment.diff(previousDeployment);
        if (deploymentDiff.length !== 0) {
          diff.push(...deploymentDiff);
        }
      } else {
        diff.push(new Diff(DiffAction.DELETE, previous!.getContext(), 'deployment', previousDeployment.deploymentTag));
      }
    }

    for (const deployment of this.deployments) {
      if (!previous?.deployments.find((d) => d.deploymentTag === deployment.deploymentTag)) {
        diff.push(new Diff(DiffAction.ADD, this.getContext(), 'deployment', deployment.deploymentTag));

        const deploymentDiff = deployment.diff();
        if (deploymentDiff.length !== 0) {
          diff.push(...deploymentDiff);
        }
      }
    }

    return diff;
  }

  getContext(): string {
    return [`support=${this.serverKey}`, this.context.getContext()].join(',');
  }

  synth(): ISupport {
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
