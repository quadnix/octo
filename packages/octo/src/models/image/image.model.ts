import { strict as assert } from 'assert';
import { resolve } from 'path';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { AModel } from '../model.abstract.js';
import type { IImage } from './image.interface.js';

/**
 * Options passed to the Docker engine while building the image.
 */
export interface IImageDockerOptions {
  /**
   * Absolute path of the Dockerfile.
   */
  dockerfilePath: string;

  /**
   * Build arguments, same as [--build-arg](https://docs.docker.com/build/guide/build-args/) option.
   */
  buildArgs?: { [key: string]: string };

  /**
   * To suppress Docker output, same as [--quiet](https://docs.docker.com/reference/cli/docker/container/run/) option.
   */
  quiet?: boolean;
}

/**
 * An Image model represents a Docker image, to either build, or run, your microservices.
 *
 * @example
 * ```ts
 * const image = new Image('nginx', '2.4', { dockerfilePath: './Dockerfile' });
 *
 * const image = new Image('docker/hello-world', '1.0', { dockerfilePath: './Dockerfile' });
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model('@octo', 'image')
export class Image extends AModel<IImage, Image> {
  readonly dockerOptions: IImageDockerOptions;

  /**
   * An imageId is the unique identifier for this image.
   * - Format of imageId is `{imageName}:{imageTag}`
   */
  readonly imageId: string;

  /**
   * The name of the image, same as [namespace in Docker](https://docs.docker.com/reference/cli/docker/image/tag/).
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z@][\w\-\/]*[a-zA-Z0-9]$/ } })
  readonly imageName: string;

  /**
   * The tag of the image, same as [tag in Docker](https://docs.docker.com/reference/cli/docker/image/tag/).
   * - Unlike Docker, `imageTag` is mandatory in Octo.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  readonly imageTag: string;

  constructor(imageName: string, imageTag: string, options: IImageDockerOptions) {
    super();
    this.imageId = `${imageName}:${imageTag}`;
    this.imageName = imageName;
    this.imageTag = imageTag;

    options.dockerfilePath = resolve(options.dockerfilePath);
    this.dockerOptions = options;
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${(this.constructor as typeof Image).NODE_NAME}=${this.imageId}`, app.getContext()].join(',');
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
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Image> {
    assert(!!deReferenceContext);

    return new Image(image.imageName, image.imageTag, {
      ...image.dockerOptions,
    });
  }
}
