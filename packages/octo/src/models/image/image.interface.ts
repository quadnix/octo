import type { Image } from './image.model.js';

export interface IImage {
  dockerOptions: Image['dockerOptions'];
  imageId: Image['imageId'];
  imageName: Image['imageName'];
  imageTag: Image['imageTag'];
}
