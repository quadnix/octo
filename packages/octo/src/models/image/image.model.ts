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
  readonly imageFamily: string;

  readonly imageId: string;

  readonly imageName: string;

  constructor(imageFamily: string, imageName: string) {
    super();
    this.imageFamily = imageFamily;
    this.imageId = `${imageFamily}/${imageName}`;
    this.imageName = imageName;
  }

  override setContext(): string | undefined {
    const parents = this.getParents();
    const app = parents['app']?.[0]?.to;
    if (!app) {
      return undefined;
    }
    return [`${(this.constructor as typeof Image).NODE_NAME}=${this.imageId}`, app.getContext()].join(',');
  }

  override synth(): ImageSchema {
    return {
      imageFamily: this.imageFamily,
      imageId: this.imageId,
      imageName: this.imageName,
    };
  }

  static override async unSynth(
    image: ImageSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Image> {
    assert(!!deReferenceContext);

    return new Image(image.imageFamily, image.imageName);
  }
}
