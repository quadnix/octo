import { Deployment } from '../deployment/deployment.model';
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

  synth(): ISupport {
    return {
      applicationType: this.applicationType,
      serverKey: this.serverKey,
    };
  }

  static async unSynth(support: ISupport): Promise<Support> {
    return new Support(support.serverKey, support.applicationType);
  }
}
