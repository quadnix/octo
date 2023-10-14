import { Image } from '../image/image.model';
import { Model } from '../model.abstract';
import { IDeployment } from './deployment.interface';

export class Deployment extends Model<IDeployment, Deployment> {
  readonly MODEL_NAME: string = 'deployment';

  readonly deploymentTag: string;

  readonly image: Image;

  constructor(deploymentTag: string, image: Image) {
    super();
    this.deploymentTag = deploymentTag;

    this.image = image;
    this.addRelationship('deploymentTag', image, 'imageId');
  }

  getContext(): string {
    const parents = this.getParents();
    const parent = (parents['server'] || parents['support'])[0].to;
    return [`${this.MODEL_NAME}=${this.deploymentTag}`, parent.getContext()].join(',');
  }

  synth(): IDeployment {
    return {
      deploymentTag: this.deploymentTag,
      image: { context: this.image.getContext() },
    };
  }

  static override async unSynth(
    deployment: IDeployment,
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<Deployment> {
    const image = (await deReferenceContext(deployment.image.context)) as Image;
    return new Deployment(deployment.deploymentTag, image);
  }
}
