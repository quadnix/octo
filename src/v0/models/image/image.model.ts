import { Model } from '../model.abstract';
import { IImage } from './image.interface';

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
    this.dockerOptions = options;
  }

  clone(): Image {
    return new Image(this.imageName, this.imageTag, this.dockerOptions);
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
}