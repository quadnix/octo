import { SupportApplicationType } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Deployment } from '../deployment/deployment.model.js';
import { AModel } from '../model.abstract.js';
import { ISupport } from './support.interface.js';

@Model(Support)
export class Support extends AModel<ISupport, Support> {
  readonly MODEL_NAME: string = 'support';

  readonly applicationType: SupportApplicationType;

  readonly serverKey: string;

  constructor(serverKey: string, applicationType: SupportApplicationType) {
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

  static override async unSynth(support: ISupport): Promise<Support> {
    return new Support(support.serverKey, support.applicationType);
  }
}
