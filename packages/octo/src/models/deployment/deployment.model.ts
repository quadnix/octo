import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import type { Diff } from '../../functions/diff/diff.js';
import { AModel } from '../model.abstract.js';
import type { IDeployment } from './deployment.interface.js';

@Model()
export class Deployment extends AModel<IDeployment, Deployment> {
  readonly MODEL_NAME: string = 'deployment';

  readonly deploymentTag: string;

  constructor(deploymentTag: string) {
    super();
    this.deploymentTag = deploymentTag;
  }

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  override getContext(): string {
    const parents = this.getParents();
    const parent = parents['server'][0].to;
    return [`${this.MODEL_NAME}=${this.deploymentTag}`, parent.getContext()].join(',');
  }

  override synth(): IDeployment {
    return {
      deploymentTag: this.deploymentTag,
    };
  }

  static override async unSynth(
    deployment: IDeployment,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Deployment> {
    return new Deployment(deployment.deploymentTag);
  }
}
