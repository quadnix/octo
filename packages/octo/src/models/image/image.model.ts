import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { ImageSchema } from './image.schema.js';

/**
 * An Image model represents a Docker image, to either build, or run, your services.
 * Images belong to an {@link Account}: an image is used only inside the account it sits in, and is
 * linked to each of its regions it is published into.
 *
 * @example
 * ```ts
 * const image = new Image('nginx', '2.4');
 * account.addImage(image);
 * ```
 *
 * @group Models/Image
 *
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Image>('@octo', 'image', ImageSchema)
export class Image extends AModel<ImageSchema, Image> {
  readonly imageFamily: string;

  readonly imageId: string;

  readonly imageName: string;

  /**
   * @param imageFamily The repository name shared by all versions of this image.
   * @param imageName The version or tag of this image within its family.
   */
  constructor(imageFamily: string, imageName: string) {
    super();
    this.imageFamily = imageFamily;
    this.imageId = `${imageFamily}/${imageName}`;
    this.imageName = imageName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    image: ImageSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Image> {
    assert(!!deReferenceContext);

    return new Image(image.imageFamily, image.imageName);
  }

  /**
   * @internal
   */
  override setContext(): string | undefined {
    const parents = this.getParents();
    const account = parents['account']?.[0]?.to;
    if (!account) {
      return undefined;
    }
    return [`${(this.constructor as typeof Image).NODE_NAME}=${this.imageId}`, account.getContext()].join(',');
  }

  /**
   * @internal
   */
  override synth(): ImageSchema {
    return {
      imageFamily: this.imageFamily,
      imageId: this.imageId,
      imageName: this.imageName,
    };
  }
}
