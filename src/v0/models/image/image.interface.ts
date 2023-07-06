import { Image } from './image.model';

export interface IImage {
  dockerOptions: Image['dockerOptions'];
  imageId: Image['imageId'];
  imageName: Image['imageName'];
  imageTag: Image['imageTag'];
}
