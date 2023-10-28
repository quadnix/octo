import { Model } from '../model.abstract.js';
import { IDeployment } from './deployment.interface.js';

export class Deployment extends Model<IDeployment, Deployment> {
  readonly MODEL_NAME: string = 'deployment';

  readonly deploymentTag: string;

  constructor(deploymentTag: string) {
    super();
    this.deploymentTag = deploymentTag;
  }

  getContext(): string {
    const parents = this.getParents();
    const parent = (parents['server'] || parents['support'])[0].to;
    return [`${this.MODEL_NAME}=${this.deploymentTag}`, parent.getContext()].join(',');
  }

  synth(): IDeployment {
    return {
      deploymentTag: this.deploymentTag,
    };
  }

  static override async unSynth(deployment: IDeployment): Promise<Deployment> {
    return new Deployment(deployment.deploymentTag);
  }
}
