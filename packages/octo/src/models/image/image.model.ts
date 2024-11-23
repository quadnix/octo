import { strict as assert } from 'assert';
import { resolve } from 'path';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { ImageSchema } from './image.schema.js';

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
@Model<Image>('@octo', 'image', ImageSchema)
export class Image extends AModel<ImageSchema, Image> {
  readonly dockerOptions: ImageSchema['dockerOptions'];

  readonly imageId: string;

  readonly imageName: string;

  readonly imageTag: string;

  constructor(imageName: string, imageTag: string, options: ImageSchema['dockerOptions']) {
    super();
    this.imageId = `${imageName}:${imageTag}`;
    this.imageName = imageName;
    this.imageTag = imageTag;

    options.dockerfilePath = resolve(options.dockerfilePath);
    this.dockerOptions = options;
  }

  override setContext(): string {
    const parents = this.getParents();
    const account = parents['account'][0].to;
    return [`${(this.constructor as typeof Image).NODE_NAME}=${this.imageId}`, account.getContext()].join(',');
  }

  override synth(): ImageSchema {
    return {
      dockerOptions: JSON.parse(JSON.stringify(this.dockerOptions)),
      imageId: this.imageTag,
      imageName: this.imageName,
      imageTag: this.imageTag,
    };
  }

  static override async unSynth(
    image: ImageSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Image> {
    assert(!!deReferenceContext);

    return new Image(image.imageName, image.imageTag, {
      ...image.dockerOptions,
    });
  }
}
