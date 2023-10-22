import { IResource, Resource } from '@quadnix/octo';
import { IIamUserProperties } from './iam-user.interface.js';

export class IamUser extends Resource<IamUser> {
  readonly MODEL_NAME: string = 'iam-user';

  constructor(resourceId: string, properties: IIamUserProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
