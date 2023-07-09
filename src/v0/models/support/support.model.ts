import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { DiffUtility } from '../../functions/diff/diff.utility';
import { IDeployment } from '../deployment/deployment.interface';
import { Deployment } from '../deployment/deployment.model';
import { Model } from '../model.abstract';
import { ISupport } from './support.interface';

export type ISupportApplicationType = 'nginx';

export class Support extends Model<ISupport, Support> {
  readonly MODEL_NAME: string = 'support';

  readonly applicationType: ISupportApplicationType;

  readonly deployments: Deployment[] = [];

  readonly serverKey: string;

  constructor(serverKey: string, applicationType: ISupportApplicationType) {
    super();
    this.serverKey = serverKey;
    this.applicationType = applicationType;
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

    // Trigger hooks related to this event.
    this.hookService.applyHooks('addDeployment');
  }

  clone(): Support {
    const support = new Support(this.serverKey, this.applicationType);

    this.deployments.forEach((deployment) => {
      support.addDeployment(deployment.clone());
    });

    return support;
  }

  diff(previous?: Support): Diff[] {
    // applicationType intentionally not included in diff, since it cannot change once set.

    // Generate diff of deployments.
    return DiffUtility.diffModels(previous?.deployments || [], this.deployments, 'deploymentTag');
  }

  isEqual(instance: Support): boolean {
    return this.serverKey === instance.serverKey;
  }

  synth(): ISupport {
    const deployments: IDeployment[] = [];
    this.deployments.forEach((deployment) => {
      deployments.push(deployment.synth());
    });

    return {
      applicationType: this.applicationType,
      deployments,
      serverKey: this.serverKey,
    };
  }
}
