import type { Image } from './image.model.js';

/**
 * {@link Image} model interface.
 *
 * @group Model Interfaces
 */
export interface IImage {
  dockerOptions: Image['dockerOptions'];
  imageId: Image['imageId'];
  imageName: Image['imageName'];
  imageTag: Image['imageTag'];
}
