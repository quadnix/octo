import { IDeployment } from '../deployment/deployment.interface';
import { Deployment } from '../deployment/deployment.model';
import { HOOK_NAMES } from '../hook.interface';
import { Model } from '../model.abstract';
import { ISupport } from './support.interface';

export type ISupportApplicationType = 'nginx';

export class Support extends Model<ISupport, Support> {
  readonly MODEL_NAME: string = 'support';

  readonly applicationType: ISupportApplicationType;

  readonly serverKey: string;

  constructor(serverKey: string, applicationType: ISupportApplicationType) {
    super();
    this.serverKey = serverKey;
    this.applicationType = applicationType;
  }

  addDeployment(deployment: Deployment): void {
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['deployment']) childrenDependencies['deployment'] = [];

    // Check for duplicates.
    const deployments = childrenDependencies['deployment'].map((d) => d.to);
    if (deployments.find((d: Deployment) => d.deploymentTag === deployment.deploymentTag)) {
      throw new Error('Deployment already exists!');
    }
    this.addChild('serverKey', deployment, 'deploymentTag');

    this.hookService.applyHooks(HOOK_NAMES.ADD_DEPLOYMENT);
  }

  clone(): Support {
    const support = new Support(this.serverKey, this.applicationType);

    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['deployment']) childrenDependencies['deployment'] = [];

    childrenDependencies['deployment'].forEach((dependency) => {
      support.addDeployment((dependency.to as Deployment).clone());
    });

    return support;
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.serverKey}`, app.getContext()].join(',');
  }

  synth(): ISupport {
    const childrenDependencies = this.getChildren();
    if (!childrenDependencies['deployment']) childrenDependencies['deployment'] = [];

    const deployments: IDeployment[] = [];
    childrenDependencies['deployment'].forEach((dependency) => {
      deployments.push((dependency.to as Deployment).synth());
    });

    return {
      applicationType: this.applicationType,
      deployments,
      serverKey: this.serverKey,
    };
  }
}
