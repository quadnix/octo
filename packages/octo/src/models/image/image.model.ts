import { resolve } from 'path';
import { Model } from '../model.abstract.js';
import { IImage } from './image.interface.js';

export interface IImageDockerOptions {
  dockerFilePath: string;
  buildArgs?: { [key: string]: string };
  quiet?: boolean;
}

export class Image extends Model<IImage, Image> {
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

    options.dockerFilePath = resolve(options.dockerFilePath);
    this.dockerOptions = options;
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.imageId}`, app.getContext()].join(',');
  }

  synth(): IImage {
    return {
      dockerOptions: {
        buildArgs: { ...this.dockerOptions.buildArgs },
        dockerFilePath: this.dockerOptions.dockerFilePath,
        quiet: this.dockerOptions.quiet,
      },
      imageId: this.imageTag,
      imageName: this.imageName,
      imageTag: this.imageTag,
    };
  }

  static override async unSynth(image: IImage): Promise<Image> {
    return new Image(image.imageName, image.imageTag, {
      ...image.dockerOptions,
    });
  }
}
