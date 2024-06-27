import { resolve } from 'path';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import type { Diff } from '../../functions/diff/diff.js';
import { AModel } from '../model.abstract.js';
import type { IImage } from './image.interface.js';

export interface IImageDockerOptions {
  dockerfilePath: string;
  buildArgs?: { [key: string]: string };
  quiet?: boolean;
}

@Model()
export class Image extends AModel<IImage, Image> {
  readonly MODEL_NAME: string = 'image';

  readonly dockerOptions: IImageDockerOptions;

  readonly imageId: string;

  readonly imageName: string;

  readonly imageTag: string;

  constructor(imageName: string, imageTag: string, options: IImageDockerOptions) {
    super();
    this.imageId = `${imageName}:${imageTag}`;
    this.imageName = imageName;
    this.imageTag = imageTag;

    options.dockerfilePath = resolve(options.dockerfilePath);
    this.dockerOptions = options;
  }

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.imageId}`, app.getContext()].join(',');
  }

  override synth(): IImage {
    return {
      dockerOptions: JSON.parse(JSON.stringify(this.dockerOptions)),
      imageId: this.imageTag,
      imageName: this.imageName,
      imageTag: this.imageTag,
    };
  }

  static override async unSynth(
    image: IImage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Image> {
    return new Image(image.imageName, image.imageTag, {
      ...image.dockerOptions,
    });
  }
}
