import { Resource } from '@quadnix/octo';
import { IEcrImageProperties } from './ecr-image.interface';

export class EcrImage extends Resource<EcrImage> {
  readonly MODEL_NAME: string = 'ecr-image';

  constructor(resourceId: string, properties: IEcrImageProperties) {
    super(resourceId);

    this.properties.buildCommand = properties.buildCommand;
    this.properties.dockerExec = properties.dockerExec;
    this.properties.dockerFileDirectory = properties.dockerFileDirectory;
    this.properties.imageName = properties.imageName;
    this.properties.imageTag = properties.imageTag;
  }
}
