import { IResource, Resource } from '@quadnix/octo';
import { IEcrImageProperties } from './ecr-image.interface';

export class EcrImage extends Resource<EcrImage> {
  readonly MODEL_NAME: string = 'ecr-image';

  // Private field denoting the current AWS Region ID.
  // This field is not serialized, is lost during commit, and is not present after deserialization.
  private awsRegionId: string;

  constructor(resourceId: string, properties: IEcrImageProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }

  getAwsRegionId(): string {
    return this.awsRegionId;
  }

  setAwsRegionId(awsRegionId: string): void {
    this.awsRegionId = awsRegionId;
  }
}
