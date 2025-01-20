import { strict as assert } from 'assert';
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
  readonly imageId: string;

  readonly imageName: string;

  readonly imageTag: string;

  constructor(imageName: string, imageTag: string) {
    super();
    this.imageId = `${imageName}:${imageTag}`;
    this.imageName = imageName;
    this.imageTag = imageTag;
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${(this.constructor as typeof Image).NODE_NAME}=${this.imageId}`, app.getContext()].join(',');
  }

  override synth(): ImageSchema {
    return {
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

    return new Image(image.imageName, image.imageTag);
  }
}
