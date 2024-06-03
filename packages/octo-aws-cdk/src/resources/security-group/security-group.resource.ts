import { AResource, Resource } from '@quadnix/octo';
import type { IResource } from '@quadnix/octo';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { ISecurityGroupProperties } from './security-group.interface.js';

@Resource()
export class SecurityGroup extends AResource<SecurityGroup> {
  readonly MODEL_NAME: string = 'security-group';

  constructor(resourceId: string, properties: ISecurityGroupProperties, parents: [Vpc]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
