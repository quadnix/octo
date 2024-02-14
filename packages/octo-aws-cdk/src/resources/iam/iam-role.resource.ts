import { AResource, IResource, Resource } from '@quadnix/octo';
import { IIamRoleProperties } from './iam-role.interface.js';

@Resource()
export class IamRole extends AResource<IamRole> {
  readonly MODEL_NAME: string = 'iam-role';

  constructor(resourceId: string, properties: IIamRoleProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
