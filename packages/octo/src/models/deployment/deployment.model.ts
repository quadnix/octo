import { Dependency } from '../../functions/dependency/dependency.model';
import { DiffAction } from '../../functions/diff/diff.model';
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

    const deploymentToImageDependency = new Dependency(this, image);
    deploymentToImageDependency.addBehavior('deploymentTag', DiffAction.ADD, 'imageId', DiffAction.ADD);
    deploymentToImageDependency.addBehavior('deploymentTag', DiffAction.ADD, 'imageId', DiffAction.UPDATE);
    this.dependencies.push(deploymentToImageDependency);
    const imageToDeploymentDependency = new Dependency(image, this);
    imageToDeploymentDependency.addBehavior('imageId', DiffAction.DELETE, 'deploymentTag', DiffAction.DELETE);
    image['dependencies'].push(imageToDeploymentDependency);
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

  static async unSynth(
    deployment: IDeployment,
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<Deployment> {
    const image = (await deReferenceContext(deployment.image.context)) as Image;
    return new Deployment(deployment.deploymentTag, image);
  }
}
